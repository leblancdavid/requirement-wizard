import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { dimensions } from "../core/epics.js";
import { assessmentCurrent, createExecutionIndex, deliveredRequirement, executionConfigSchema, type Assessment, type ExecutionState } from "../core/execution.js";
import { planningConfigFingerprint, planningCurrent } from "../core/implementation-planning.js";
import { extendRecoveryRevision, implementationRecoveryKey, implementationRevisionMatches, recoveryRevisionCurrent } from "../core/implementation-revisions.js";
import { requirementFingerprint } from "../core/implementation.js";
import { assessmentContextFingerprint } from "../core/execution-context.js";
import { artifactFollowThrough } from "../core/follow-through.js";
import { executionEvaluation } from "../ui/execution-state.js";
import { decodePortable } from "./portable.js";
import { renderWorkspace } from "./workspace.js";
import { planningStageMaterials, planImplementationStages, replayImplementationStages, runImplementationStages } from "../service/planning-stages.js";
import { ImplementationService } from "../service/implementation.js";
import type { GitDelivery } from "../service/git-delivery.js";

function fixture() {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "implementation-recovery-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path), p = store.create("Implementation recovery upgrade", "Retain original intent", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["a", "b"].map((id) => ({ type: "upsert", epicID: id, title: id, purpose: id, dependencies: [] })));
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Original findings", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
    requirements: ["First", "Second", "Third"].map((statement, index) => ({ statement, rationale: "Human intent", acceptance: [statement], sourceIDs: [p.sources[0]!.id], epicID: index < 2 ? "a" : "b" })),
    assessments: ["a", "b"].map((epicID) => ({ epicID, confidence: "high", explanation: "Saved", checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: "Exact evidence", evidenceIDs: [p.sources[0]!.id] })) })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  const lost = structuredClone(p); lost.revision++; lost.assessments = []; store.close();
  const db = new Database(path);
  try {
    db.prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ?").run(lost.revision, JSON.stringify(lost), p.id);
    db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(p.id, lost.revision, "Curated historical assessment loss", JSON.stringify(lost));
  } finally { db.close(); }
  store = new ProjectStore(path);
  return { store, path, directory, project: store.get(p.id), cleanup() { this.store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

function savedExecution(f: ReturnType<typeof fixture>, status: NonNullable<ExecutionState["planning"]>["status"] = "approved") {
  const p = f.project, state = f.store.execution(p.id);
  state.config = executionConfigSchema.parse({ repository: "fixture/repo", providerID: "openai", modelID: "fixture", strategy: "main", checks: ["fixture-check"] });
  for (const [index, r] of p.requirements.entries()) {
    const assessment: Assessment = { fingerprint: requirementFingerprint(r), specificationRevision: index === 1 ? p.revision - 1 : p.revision,
      status: "complete", explanation: "Original code evidence", evidenceIDs: [], scenarios: [], head: "saved-head", scope: "workspace", capturedAt: "2026-10-29", files: [], omissions: 0, verified: false };
    if (index === 2) assessment.contextFingerprint = assessmentContextFingerprint(p, r.id);
    state.assessments[r.id] = assessment;
    (state.mainAssessments ??= {})[r.id] = { ...assessment, scope: "main", verified: true };
    state.delivered[r.id] = { fingerprint: index === 1 ? "already-stale" : requirementFingerprint(r), contextFingerprint: assessmentContextFingerprint(p, r.id), main: "original-main", at: "2026-10-29", repository: "fixture/repo", checks: [] };
  }
  state.planning = { format: 1, id: "original-plan", revision: p.revision, bindingID: "original-binding", createdAt: "2026-10-29", status, approvedAt: status === "approved" ? "original-approval" : undefined,
    model: p.model, configFingerprint: planningConfigFingerprint(state), sessions: ["original-session"],
    output: { summary: "Saved plan", packages: (status === "interrupted" ? p.requirements.slice(0, 1) : p.requirements).map((r) => ({ requirementID: r.id, title: r.statement, reason: "Original", steps: ["Build"], verification: ["Check"], prerequisites: [], questions: [] })) } };
  const materials = planningStageMaterials(p, state, p.requirements[2]!.id);
  state.planning.stageWork = { [materials.requirementID]: { ...planImplementationStages(materials), attempts: 2 } };
  state.planningHistory = [{ ...structuredClone(state.planning), id: "earlier-plan", revision: p.revision - 1 }];
  state.run = { id: "original-run", revision: p.revision, bindingID: "original-binding", repositoryRoot: "original-root", config: structuredClone(state.config), scope: {}, requirementIDs: p.requirements.map((r) => r.id),
    units: [{ id: "original-unit", epicID: "a", branch: "original-branch", base: "original-base", directory: "original-worktree", delivery: "awaiting-merge", pr: "https://example.test/pr/1",
      items: [{ requirementID: p.requirements[0]!.id, fingerprint: requirementFingerprint(p.requirements[0]!), status: "verified", sessionID: "original-coding-session", commit: "original-commit", checks: [] }] }],
    status: "interrupted", progress: ["Original progress"], createdAt: "2026-10-29" };
  state.history = [{ ...structuredClone(state.run), id: "earlier-run", revision: p.revision - 1 }];
  f.store.saveExecution(p.id, state); return f.store.execution(p.id);
}
function evidence(state: ExecutionState) { const { version: _version, recoveryRevision: _certificate, ...saved } = state; return saved; }
function restore(f: ReturnType<typeof fixture>, epicID: string) {
  const preview = f.store.previewAssessmentRecovery(f.project.id, epicID); assert.equal(preview.blocker, null); assert.equal(preview.status, "found");
  return f.store.restoreAssessmentHistory(f.project.id, preview.revision, { epicID, ...preview.candidate! });
}

for (const status of ["approved", "proposed", "interrupted"] as const) test(`${status} plans, legacy/modern code findings and frozen runs survive consecutive recovery and reopen`, () => {
  const f = fixture();
  try {
    const before = savedExecution(f, status), revision = f.project.revision;
    assert.equal(before.recoveryRevision, undefined);
    const first = restore(f, "a"), second = restore(f, "b"), after = f.store.execution(f.project.id);
    assert.equal(first.revision, revision + 1); assert.equal(second.revision, revision + 2);
    assert.deepEqual(evidence(after), evidence(before), "No plan, approval, original revision, session, spent attempt, run or delivery evidence is rebased");
    assert.equal(after.recoveryRevision!.fromRevision, revision); assert.equal(after.recoveryRevision!.throughRevision, second.revision);
    assert.equal(after.recoveryRevision!.inputKey, implementationRecoveryKey(f.project));
    assert.equal(planningCurrent(second, after, "original-binding"), true);
    assert.equal(planningCurrent(second, { ...after, planning: before.planningHistory![0] }, "original-binding"), false, "Already stale plans never become current");
    assert.equal(implementationRevisionMatches(second, after, after.run!.revision), true);
    assert.equal(implementationRevisionMatches(second, after, after.history[0]!.revision), false);
    const priorProjection = executionEvaluation(before), projected = executionEvaluation(after, priorProjection), index = createExecutionIndex(second, projected);
    assert.notEqual(projected, priorProjection, "A certificate-only execution change participates in browser freshness calculations");
    for (const [i, r] of second.requirements.entries()) {
      assert.equal(assessmentCurrent(second, projected, r.id, undefined, index), i !== 1);
      assert.equal(deliveredRequirement(second, projected, r.id, index), i !== 1);
    }
    const material = planningStageMaterials(second, after, second.requirements[2]!.id);
    replayImplementationStages(second, material, after.planning!.stageWork![material.requirementID]!);
    assert.equal(after.planning!.stageWork![material.requirementID]!.attempts, 2, "Recovery never resets failed-attempt allowance");
    assert.notEqual(artifactFollowThrough(second, after, "original-binding").find((item) => item.kind === "implementation-plan")!.state, "outdated");
    for (let i = 0; i < 2; i++) { f.store.close(); f.store = new ProjectStore(f.path); assert.deepEqual(f.store.execution(second.id), after); assert.equal(planningCurrent(f.store.get(second.id), f.store.execution(second.id), "original-binding"), true); }
    const decoded = decodePortable(renderWorkspace(second, after), { ...second.model, modelID: "different-local-discovery-model", connectionID: "different-local-account" });
    assert.deepEqual(decoded.execution.recoveryRevision, after.recoveryRevision);
    assert.equal(planningCurrent(decoded.project, decoded.execution, "portable"), true);
    assert.equal(assessmentCurrent(decoded.project, decoded.execution, second.requirements[0]!.id), true);
  } finally { f.cleanup(); }
});

test("recovery-only equivalence never bypasses content, workspace, config, manual reassessment or future revision gates", () => {
  const f = fixture();
  try {
    savedExecution(f); const p = restore(f, "a"), state = f.store.execution(p.id), target = p.requirements[0]!;
    assert.equal(planningCurrent(p, state, "different-binding"), false);
    const configChanged = structuredClone(state); configChanged.config!.checks = ["different-check"];
    assert.equal(planningCurrent(p, configChanged, "original-binding"), false);
    const requested = structuredClone(state); requested.assessmentRequests = { [target.id]: { token: "new-token", reason: "External change", at: "now" } };
    assert.equal(assessmentCurrent(p, requested, target.id), false);
    const edited = structuredClone(p); edited.sources[0]!.text = "Different human intent at the same revision";
    assert.equal(recoveryRevisionCurrent(edited, state.recoveryRevision), false); assert.equal(assessmentCurrent(edited, state, target.id), false);
    assert.equal(implementationRevisionMatches(p, state, p.revision + 1), false);
    const files = renderWorkspace(p, state);
    for (const change of [{ inputKey: "0".repeat(64) }, { throughRevision: p.revision + 1 }, { policy: "future-policy" }]) {
      const wire = JSON.parse(files["execution.json"]!);
      Object.assign(wire.execution.recoveryRevision, change);
      assert.throws(() => decodePortable({ ...files, "execution.json": JSON.stringify(wire) }, p.model), "Invalid portable equivalence must reject without importing new credit");
    }
    const accidentalMutation = structuredClone(p); accidentalMutation.revision++; accidentalMutation.requirements[0]!.statement = "Changed behavior";
    assert.throws(() => extendRecoveryRevision(p, accidentalMutation, state.recoveryRevision), /changed implementation inputs/);
    accidentalMutation.requirements = structuredClone(p.requirements); accidentalMutation.model.modelID = "changed-during-recovery";
    assert.throws(() => extendRecoveryRevision(p, accidentalMutation, state.recoveryRevision), /changed implementation inputs/);
    const changed = f.store.note(p.id, p.revision, "A real product decision", "a");
    assert.equal(planningCurrent(changed, state, "original-binding"), false); assert.equal(assessmentCurrent(changed, state, target.id), false);
    const next = restore(f, "b"), nextState = f.store.execution(p.id);
    assert.equal(nextState.recoveryRevision!.fromRevision, changed.revision, "Never bridge across a non-recovery mutation");
    assert.equal(planningCurrent(next, nextState, "original-binding"), false);
    assert.equal(implementationRevisionMatches(next, nextState, f.project.revision), false);
  } finally { f.cleanup(); }
});

test("execution certificate and restoration roll back together and explicit retry does not lose evidence", () => {
  const f = fixture();
  try {
    const before = savedExecution(f), project = f.store.get(f.project.id), db = new Database(f.path);
    try {
      db.exec("CREATE TRIGGER fail_recovery_revision BEFORE INSERT ON revisions WHEN NEW.reason LIKE 'Human restored saved definition assessment%' BEGIN SELECT RAISE(ABORT, 'Injected recovery failure'); END");
      assert.throws(() => restore(f, "a"), /Injected recovery failure/);
      assert.deepEqual(f.store.get(project.id), project); assert.deepEqual(f.store.execution(project.id), before);
      db.exec("DROP TRIGGER fail_recovery_revision");
      const after = restore(f, "a"); assert.equal(planningCurrent(after, f.store.execution(project.id), "original-binding"), true);
    } finally { db.close(); }
  } finally { f.cleanup(); }
});

test("portable adoption preserves recovery certificates and plan/code reuse while keeping coding sessions machine-local", () => {
  const f = fixture(); let clone: ProjectStore | undefined;
  try {
    const workspace = join(f.directory, "workspace"); mkdirSync(workspace);
    f.store.connectWorkspace(f.project.id, f.project.revision, workspace);
    const state = savedExecution(f); state.planning!.bindingID = f.store.workspace(f.project.id)!.bindingID!;
    f.store.saveExecution(f.project.id, state);
    const recovered = restore(f, "a"), original = f.store.execution(recovered.id);
    assert.equal(f.store.syncWorkspace(recovered.id)!.status, "saved");
    clone = new ProjectStore(join(f.directory, "clone.sqlite"));
    const imported = clone.openWorkspace(workspace, { providerID: "openai", modelID: "another-local-model" }), adopted = clone.execution(imported.id);
    assert.deepEqual(adopted.recoveryRevision, original.recoveryRevision);
    assert.equal(planningCurrent(imported, adopted, clone.workspace(imported.id)!.bindingID), true);
    assert.equal(assessmentCurrent(imported, adopted, imported.requirements[0]!.id), true);
    assert.equal(assessmentCurrent(imported, adopted, imported.requirements[1]!.id), false);
    assert.equal(deliveredRequirement(imported, adopted, imported.requirements[0]!.id), true);
    assert.equal(adopted.run!.units[0]!.items[0]!.sessionID, undefined);
    assert.equal(clone.queuePaused(imported.id), true);
    assert.deepEqual(f.store.execution(recovered.id), original, "Adoption never rewrites original machine-local coding evidence");
  } finally { clone?.close(); f.cleanup(); }
});

test("current execution payloads reopen unchanged; future certificate formats fail closed without rewriting data", () => {
  const f = fixture();
  try {
    const before = savedExecution(f); f.store.close(); f.store = new ProjectStore(f.path);
    assert.deepEqual(f.store.execution(f.project.id), before);
    const after = restore(f, "a"), state = f.store.execution(after.id), files = renderWorkspace(after, state);
    const wire = JSON.parse(files["execution.json"]!); wire.execution.recoveryRevision.format = 99;
    assert.throws(() => decodePortable({ ...files, "execution.json": JSON.stringify(wire) }, after.model));
    f.store.close(); const db = new Database(f.path);
    try {
      db.prepare("UPDATE execution_state SET payload = json_set(payload, '$.recoveryRevision.format', 99) WHERE project_id = ?").run(after.id);
      const saved = db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(after.id);
      assert.throws(() => new ProjectStore(f.path));
      assert.deepEqual(db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(after.id), saved);
    } finally {
      db.prepare("UPDATE execution_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(state), after.id);
      db.close(); f.store = new ProjectStore(f.path);
    }
  } finally { f.cleanup(); }
});

test("v1-to-v2 upgrade is backed up, transactional and repeatable without changing evidence or issuing equivalence", () => {
  const f = fixture();
  try {
    const original = savedExecution(f); f.store.close();
    const db = new Database(f.path), legacy = { ...original, schemaVersion: 1 };
    try {
      db.prepare("UPDATE execution_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(legacy), f.project.id);
      db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DELETE FROM migration_history WHERE version >= 9; PRAGMA user_version = 8;");
      db.exec("CREATE TRIGGER fail_recovery_upgrade BEFORE UPDATE ON execution_state BEGIN SELECT RAISE(ABORT, 'Injected upgrade failure'); END");
      assert.throws(() => new ProjectStore(f.path), /Injected upgrade failure/);
      assert.equal(db.pragma("user_version", { simple: true }), 8);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM execution_migration_backups WHERE migration = 9").get() as { n: number }).n, 0);
      assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(f.project.id) as { payload: string }).payload), legacy);
      db.exec("DROP TRIGGER fail_recovery_upgrade");
      db.prepare("INSERT INTO execution_leases(resource, project_id, owner, lease_until) VALUES (?, ?, ?, ?)").run("fixture-upgrade", f.project.id, "fixture-owner", Date.now() + 60000);
      const liveLease = db.prepare("SELECT * FROM execution_leases WHERE project_id = ?").get(f.project.id);
      assert.throws(() => new ProjectStore(f.path), /Stop active implementation workers/);
      assert.deepEqual(db.prepare("SELECT * FROM execution_leases WHERE project_id = ?").get(f.project.id), liveLease);
      assert.equal(db.pragma("user_version", { simple: true }), 8);
      db.prepare("UPDATE execution_leases SET lease_until = ? WHERE project_id = ?").run(Date.now() - 1, f.project.id);
    } finally { db.exec("DROP TRIGGER IF EXISTS fail_recovery_upgrade"); db.close(); f.store = new ProjectStore(f.path); }
    const upgraded = f.store.execution(f.project.id);
    assert.equal(upgraded.schemaVersion, 2); assert.equal(upgraded.version, original.version + 1);
    assert.equal(upgraded.recoveryRevision, undefined, "Upgrade alone never manufactures a recovery certificate");
    assert.equal(f.store.executionExpired(f.project.id), true, "Startup preserves expired leases rather than clearing another worker's evidence");
    assert.deepEqual(evidence(upgraded), evidence(original));
    assert.equal(assessmentCurrent(f.project, upgraded, f.project.requirements[0]!.id), true);
    assert.equal(assessmentCurrent(f.project, upgraded, f.project.requirements[1]!.id), false);
    assert.equal(deliveredRequirement(f.project, upgraded, f.project.requirements[0]!.id), true);
    const check = new Database(f.path);
    try { assert.equal((check.prepare("SELECT payload FROM execution_migration_backups WHERE project_id = ? AND migration = 9").get(f.project.id) as { payload: string }).payload, JSON.stringify(legacy)); }
    finally { check.close(); }
    for (let i = 0; i < 2; i++) { f.store.close(); f.store = new ProjectStore(f.path); assert.deepEqual(f.store.execution(f.project.id), upgraded); }
    const files = renderWorkspace(f.project, upgraded), wire = JSON.parse(files["execution.json"]!);
    wire.execution.schemaVersion = 1;
    const imported = decodePortable({ ...files, "execution.json": JSON.stringify(wire) }, f.project.model);
    assert.equal(imported.execution.schemaVersion, 2); assert.equal(imported.execution.recoveryRevision, undefined);
    assert.deepEqual(imported.execution.assessments, upgraded.assessments);
    assert.equal(planningCurrent(f.project, upgraded, "original-binding"), true);
  } finally { f.cleanup(); }
});

async function untilIdle(service: ImplementationService, id: string) {
  for (let i = 0; i < 1000; i++) { if (!service.isActive(id)) return; await new Promise((accept) => setTimeout(accept, 10)); }
  assert.fail("Fixture implementation operation did not settle");
}

test("explicit planning continuation after recovery skips completed packages and retains spent exact-stage attempts", async () => {
  const f = fixture(); let service: ImplementationService | undefined;
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.directory);
    const state = savedExecution(f, "interrupted"); delete state.run;
    state.planning!.bindingID = f.store.workspace(f.project.id)!.bindingID!;
    const target = f.project.requirements[2]!.id;
    const work = state.planning!.stageWork![target]!; work.attempts = 0;
    f.store.saveExecution(f.project.id, state);
    let setupCalls = 0;
    const targetPackage = { requirementID: target, title: "Third", reason: "Original", steps: ["Build"], verification: ["Check"], prerequisites: [], questions: [] };
    for (let retry = 0; retry < 2; retry++) await assert.rejects(runImplementationStages(f.project, state, target, () => f.store.saveExecution(f.project.id, state), () => {}, async () => {
      if (setupCalls++ === 0) return JSON.stringify({ summary: "Original collected evidence", packages: [targetPackage] });
      throw new Error("Injected verification failure");
    }), /Injected verification failure/);
    assert.equal(work.receipts.length, 1); assert.equal(work.attempts, 2);
    const completedReceipt = structuredClone(work.receipts[0]);
    const completedPackage = structuredClone(state.planning!.output!.packages[0]!);
    const current = restore(f, "a");
    const called: string[] = [];
    service = new ImplementationService(f.store, { async perform(request) {
      assert.equal(request.planning, true); assert.equal(request.coding, false);
      called.push(request.requirementID!);
      if (request.requirementID === target && called.filter((id) => id === target).length === 1)
        assert.equal(f.store.execution(current.id).planning!.stageWork![target]!.attempts, 3, "The third attempt is spent durably, not reset by recovery");
      const r = current.requirements.find((r) => r.id === request.requirementID)!;
      return JSON.stringify({ summary: "Continued saved plan", packages: [{ requirementID: r.id, title: r.statement, reason: "Original", steps: ["Build"], verification: ["Check"], prerequisites: [], questions: [] }] });
    } }, () => ({ async localPreflight() {}, async git() { return f.directory; } }) as unknown as GitDelivery);
    assert.deepEqual(called, [], "Restoring evidence itself never dispatches a request");
    service.start(current.id, current.revision, "plan"); await untilIdle(service, current.id);
    const after = f.store.execution(current.id);
    assert.equal(after.planning!.status, "proposed", after.planning!.diagnostic);
    assert.deepEqual(called, [current.requirements[1]!.id, target], "Neither the completed package nor completed exact evidence read is repeated");
    assert.deepEqual(after.planning!.output!.packages.find((p) => p.requirementID === completedPackage.requirementID), completedPackage);
    assert.deepEqual(after.planning!.stageWork![target]!.receipts[0], completedReceipt);
    assert.equal(after.planning!.stageWork![target]!.receipts[1]!.attempts, 3);
    assert.equal(after.planningHistory!.some((plan) => plan.id === state.planning!.id && plan.revision === f.project.revision), true);
  } finally { await service?.close(); f.cleanup(); }
});

test("frozen-run continuation accepts recovery-only revisions but rejects later real edits, without replaying coding", async () => {
  const f = fixture(); let service: ImplementationService | undefined;
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.directory);
    const state = savedExecution(f); state.run!.bindingID = f.store.workspace(f.project.id)!.bindingID!;
    f.store.saveExecution(f.project.id, state);
    const current = restore(f, "a"), originalRun = structuredClone(state.run!);
    let calls = 0;
    service = new ImplementationService(f.store, { async perform() { calls++; assert.fail("No coding should repeat while waiting for main delivery"); } }, (_path, config) => ({ config,
      async git() { return f.directory; }, async preflight() {}, async contains() { return false; },
      async pr() { return { state: "OPEN", url: "https://example.test/pr/1" }; },
    }) as unknown as GitDelivery);
    service.start(current.id, current.revision, "continue"); await untilIdle(service, current.id);
    const resumed = f.store.execution(current.id).run!;
    assert.equal(resumed.status, "awaiting-merge", resumed.diagnostic);
    assert.equal(resumed.revision, originalRun.revision); assert.deepEqual(resumed.units, originalRun.units);
    assert.equal(calls, 0);
    const edited = f.store.note(current.id, current.revision, "A new behavior changes the implementation inputs", "a");
    service.start(edited.id, edited.revision, "continue"); await untilIdle(service, edited.id);
    assert.match(f.store.execution(current.id).run!.diagnostic!, /Saved run is stale/);
    assert.equal(calls, 0);
  } finally { await service?.close(); f.cleanup(); }
});
