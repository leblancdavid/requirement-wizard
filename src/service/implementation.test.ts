import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { ImplementationService } from "./implementation.js";
import { GitDelivery, command, githubRepository, inspectWorkspaceRepository } from "./git-delivery.js";
import { assessmentCurrent, emptyExecution, executionConfigSchema, implementationPlan, deliveredRequirement, validateAssessment } from "../core/execution.js";
import { requirementFingerprint } from "../core/implementation.js";
import type { ExecutionAdapter, ExecutionRequest } from "../runtime/execution.js";
import type { DeliveryUnit, ExecutionConfig } from "../core/execution.js";
import Database from "better-sqlite3";
import { legacyAssessmentSkillDocument } from "../storage/fixtures/assessment-skill-v1.js";

function seed(store: ProjectStore, count = 2) {
  let p = store.create("Implementation fixture", "Save and reopen work", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: Array.from({ length: count }, (_, index) => ({ statement: `Capability ${index + 1}`, rationale: "Required behavior", sourceIDs: [p.sources[0]!.id], acceptance: ["The capability is available after restart"] })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  return p;
}
const config = (strategy: ExecutionConfig["strategy"] = "requirement-pr") => executionConfigSchema.parse({ repository: "fixture/repository", strategy, branch: "delivery", providerID: "openai", modelID: "fixture", checks: ['node -e "process.exit(0)"'] });

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
    await writeFile(join(root, ".gitignore"), ".requirement-wizard/\nassets/\n");
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
    const published = JSON.parse(await readFile(join(root, ".requirement-wizard", "progress.json"), "utf8"));
    assert.equal(published.implementationDelivery[0].assessment.model, undefined, "Local model/cache selection does not enter portable artifacts");
    assert.equal(published.implementationDelivery[0].assessment.captureFingerprint, undefined);
    assert.equal(published.implementationDelivery[0].assessment.contextFingerprint, undefined);
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
    await writeFile(join(root, ".gitignore"), ".requirement-wizard/\n");
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
    legacyDB.exec("DROP TABLE migration_history; DROP TABLE execution_migration_backups; PRAGMA user_version = 1;"); legacyDB.close();
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
    await Promise.race([secondReady, until(service, p.id).then(() => assert.fail("Second forced requirement did not start"))]);
    service.stop(p.id); await until(service, p.id);
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

test("assessment keeps one snapshot across concurrent answers and both phases, with relevant freshness and retry reuse", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/concurrent-assessment-")), root = join(directory, "repo"), remote = join(directory, "remote.git");
  await mkdir(root);
  const git = async (cwd: string, args: string[]) => { const result = await command(cwd, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output); return result.output; };
  const store = new ProjectStore(":memory:"); let service: ImplementationService | undefined;
  try {
    await git(directory, ["init", "--bare", remote]); await git(root, ["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "Saved records survive restarting.\n");
    await writeFile(join(root, ".gitignore"), ".requirement-wizard/\n");
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
      const answer = () => { const latest = store.get(p.id); store.answer(p.id, latest.revision, question.id, { kind: "answer", text: `Concurrent ${mode} answer` }); changed = true; };
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
      assert.equal(calls, 2); assert.equal(changed, true); assert.equal(latest.questions.find((q) => q.id === question.id)!.status, "answered");
      assert.deepEqual(state.assessmentRuns!.slice(-2).map((run) => [run.status, run.revision]), [["completed", before.revision], ["completed", before.revision]], state.assessmentStatus);
      assert.equal(state.workspaceAssessments![r.id]!.contextFingerprint, state.mainAssessments![r.id]!.contextFingerprint);
      assert.equal(state.mainAssessments![r.id]!.specificationRevision, before.revision);
      assert.equal(assessmentCurrent(latest, state, r.id), mode === "unrelated");
      assert.equal(deliveredRequirement(latest, state, r.id), mode === "unrelated");
      if (mode !== "unrelated") assert.match(state.assessmentStatus!, /need reassessment/);
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
      const published = JSON.parse(await readFile(join(root, ".requirement-wizard", "progress.json"), "utf8"));
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
        service.start(p.id, before.revision, "assess"); await until(service, p.id);
        const state = service.snapshot(p.id), run = state.assessmentRuns!.at(-1)!;
        assert.equal(run.status, "failed"); assert.equal(run.completedIDs.length, 0);
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
    assert.match(service.snapshot(p.id).run!.diagnostic!, /Specification changed.*Archive the run/);
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

test("an oversized single requirement pauses before inference, preserves human decisions, and never advances to another task", async () => {
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
    assert.deepEqual(store.get(p.id).sources.filter((s) => s.kind === "note").map((s) => s.text), humanTexts);
  } finally { await service.close(); store.close(); await rm(root, { recursive: true, force: true }); }
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
    if (request.coding) {
      const data = JSON.parse(request.prompt.split("\n")[1]!) as { requirement: { id: string } };
      assert.equal(request.requirementID, data.requirement.id);
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
    await writeFile(join(root, "README.md"), "# Fixture\n"); await writeFile(join(root, ".gitignore"), ".requirement-wizard/\n");
    await run(root, ["add", "."]); await run(root, ["commit", "-m", "Fixture baseline"]); await run(root, ["remote", "add", "origin", remote]); await run(root, ["push", "origin", "main"]);
    const p = seed(store); store.connectWorkspace(p.id, p.revision, root);
    projectID = p.id; targets = p.requirements;
    // Unrelated human changes remain in the original workspace and never enter commits.
    await writeFile(join(root, "human.txt"), "Uncommitted human work");
    service = new ImplementationService(store, adapter, (path, config, signal) => new FixtureGit(path, config, signal));
    const settings = config(strategy);
    if (strategy === "branch") { settings.dependencies[p.requirements[1]!.id] = [p.requirements[0]!.id]; settings.checks = ['node -e "process.exit(process.env.REQWIZIT_FAIL_CHECK ? 1 : 0)"']; process.env.REQWIZIT_FAIL_CHECK = "1"; }
    service.configure(p.id, p.revision, settings);
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
