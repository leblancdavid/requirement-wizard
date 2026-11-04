import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { emptyExecution, executionConfigSchema, type ExecutionState } from "../core/execution.js";
import { checkExecutionContext } from "../core/execution-context.js";
import { implementationPlanningWorkSchema, planningConfigFingerprint, planningAncestryLimit, planningWorkDepth, type ImplementationPlanningOutput } from "../core/implementation-planning.js";
import { implementationPlanningContext, PlanningContextOverflow, planningWire } from "./planning-context.js";
import { planImplementationStages, planningStageMaterials, replayImplementationStages, runImplementationStages, planningCollectedKeys, planningStageInputKey, planImplementationFollowup, planningStageTotal, PlanningBudgetPause } from "./planning-stages.js";
import { ImplementationService } from "./implementation.js";
import type { GitDelivery } from "./git-delivery.js";
import { portableExecution, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { planningTargetInput, planningReuseKey } from "./planning-reuse.js";
import { capturePlanningSources } from "./planning-sources.js";

const prose = (key: string, length = 110) => Array.from({ length }, (_, n) => createHash("sha256").update(`${key}-${n}`).digest("hex")).join("");
function seed(store: ProjectStore, notes = 10) {
  let p = store.create("Large planning fixture", "Keep original behavior", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "runtime", title: "Runtime", purpose: "Saved behavior", dependencies: [] }]);
  for (let i = 0; i < notes; i++) p = store.note(p.id, p.revision, `Human constraint ${i}\r\n${prose(`note-${i}`)}`, "project");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [{ epicID: "runtime", statement: "Save local game state", rationale: "Durable behavior", sourceIDs: [p.sources[0]!.id], acceptance: ["Restart restores the recorded progress"] }], retireQuestions: [] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Keep exact original constraints.");
  const state = emptyExecution();
  state.config = executionConfigSchema.parse({ repository: "fixture/repo", strategy: "branch", branch: "delivery", providerID: "openai", modelID: "fixture", checks: ["node --version"] });
  state.planning = { format: 1, id: "fixture-plan", revision: p.revision, bindingID: "fixture", createdAt: "2026-10-25", status: "generating", configFingerprint: "fixture", model: p.model };
  return { p, state, id: p.requirements[0]!.id };
}
const output = (id: string): ImplementationPlanningOutput => ({ summary: "Reviewable package", packages: [{ requirementID: id, title: "Local persistence", reason: "Approved restart behavior", steps: ["Implement the approved saved-state behavior"], verification: ["Restart restores progress"], prerequisites: [], questions: [] }] });

for (const partial of [false, true]) test(`later ${partial ? "partial" : "completed"} target sources survive repeated early failures, restart and portable adoption`, async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-carry-")), root = join(dir, "repo"), clone = join(dir, "clone"), path = join(dir, "state.sqlite");
  mkdirSync(root); mkdirSync(clone); let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  let service: ImplementationService | undefined, adopted: ImplementationService | undefined;
  try {
    const f = await evidencePlanningFixture(store); let project = f.original;
    const first = f.id, later = f.dependency;
    store.connectWorkspace(project.id, project.revision, root);
    const git = (path: string) => () => ({ async localPreflight() {}, async git() { return path; } }) as unknown as GitDelivery;
    let phase = "initial", laterCalls = 0; const accepted = new Set<string>();
    const adapter = { async perform({ prompt, requirementID }: { prompt: string; requirementID?: string }) {
      if (phase === "early" && requirementID === first) throw new Error("Stop before visiting later target");
      if (requirementID === later) {
        laterCalls++;
        if (partial && phase === "initial" && laterCalls === 2) throw new Error("Save one original read and a spent attempt");
        assert.ok(!accepted.has(prompt), "An accepted original request must never repeat"); accepted.add(prompt);
      }
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
      return JSON.stringify(data.draft ?? output(requirementID!));
    } };
    service = new ImplementationService(store, adapter, git(root)); service.configure(project.id, project.revision, f.state.config!);
    service.start(project.id, project.revision, "plan"); await until(service, project.id);
    const original = structuredClone(store.execution(project.id).planning!), oldWork = original.stageWork![later]!;
    assert.equal(original.status, partial ? "failed" : "proposed", original.diagnostic);
    assert.equal(oldWork.attempts, partial ? 1 : 0); assert.ok(oldWork.receipts.length);
    phase = "early";
    for (let n = 0; n < 2; n++) {
      project = store.note(project.id, project.revision, `Added current constraint ${n}`, "runtime");
      const before = laterCalls;
      service.start(project.id, project.revision, "plan"); await until(service, project.id);
      const paused = store.execution(project.id).planning!, source = paused.pendingSources![later]!;
      assert.equal(paused.format, 2); assert.equal(paused.status, "failed"); assert.equal(laterCalls, before);
      assert.equal(source.sourcePlanID, original.id); assert.equal(source.mode, "staged");
      if (source.mode !== "staged") assert.fail();
      assert.deepEqual(source.work, oldWork); assert.equal(paused.targetInputs?.[later], undefined);
      await service.close(); store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.execution(project.id).planning, paused);
      service = new ImplementationService(store, adapter, git(root));
    }
    store.syncWorkspace(project.id); cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, project.model), imported = consumer.execution(opened.id);
    assert.equal(imported.planningHistory?.length ?? 0, 0, "Full history is not required for target recovery");
    assert.equal(imported.planning!.pendingSources![later]!.bindingID, consumer.workspace(opened.id)!.bindingID);
    phase = "finish"; adopted = new ImplementationService(consumer, adapter, git(clone));
    adopted.start(opened.id, opened.revision, "plan"); await until(adopted, opened.id);
    const finished = consumer.execution(opened.id).planning!, work = finished.stageWork![later]!;
    assert.equal(finished.status, "proposed", finished.diagnostic); assert.deepEqual(finished.pendingSources, {});
    assert.notEqual(work.format, 1); if (work.format === 1) assert.fail();
    assert.deepEqual(work.baseline.work, oldWork); assert.equal(work.baseline.sourcePlanID, original.id);
    assert.deepEqual(work.baseline.sourceInput, original.targetInputs![later]);
    assert.equal(finished.output!.packages.length, 2); assert.equal(consumer.execution(opened.id).run, undefined);
    const before = laterCalls;
    adopted.start(opened.id, opened.revision, "plan"); await until(adopted, opened.id);
    assert.equal(laterCalls, before, "Completed current packages survive another explicit preparation without inference");
  } finally { await service?.close(); await adopted?.close(); store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("source selection respects the nearest touched target, settings epochs, review boundaries and legacy missing provenance", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store, 0), plan = state.planning!;
    plan.configFingerprint = planningConfigFingerprint(state); plan.status = "proposed"; plan.output = output(id);
    plan.targetInputs = { [id]: { format: 1, policy: "exact-planning-inputs-v1", mode: "single", inputKey: planningTargetInput(p, state, id).inputKey,
      originPlanID: plan.id, originRevision: p.revision, packageKey: planningReuseKey(plan.output.packages[0]) } };
    const original = structuredClone(plan), snapshot = () => p;
    assert.equal(capturePlanningSources(p, state, "fixture", snapshot)[id]!.sourcePlanID, plan.id);
    for (const mutate of [
      (copy: typeof state) => { copy.planning!.status = "approved"; },
      (copy: typeof state) => { copy.planning!.status = "dismissed"; },
      (copy: typeof state) => { copy.planning!.bindingID = "different-folder"; },
      (copy: typeof state) => { copy.planning!.model.modelID = "different-model"; },
      (copy: typeof state) => { copy.planning!.configFingerprint = "different-settings"; },
      (copy: typeof state) => { delete copy.planning!.targetInputs; },
    ]) {
      const copy = structuredClone(state); copy.planningHistory = [original]; mutate(copy);
      assert.deepEqual(capturePlanningSources(p, copy, "fixture", snapshot), {}, "Older history must not bypass a newer target boundary");
    }
    const copy = structuredClone(state); copy.planningHistory = [original];
    copy.planning = { ...copy.planning!, id: "early-failure", status: "failed", output: undefined, targetInputs: undefined };
    assert.equal(capturePlanningSources(p, copy, "fixture", snapshot)[id]!.sourcePlanID, original.id, "Untouched targets can recover from compatible local history");
    copy.planningHistory![0]!.status = "dismissed";
    assert.deepEqual(capturePlanningSources(p, copy, "fixture", snapshot), {});
  } finally { store.close(); }
});

test("capture failures preserve the old plan, release only the owned lease, and permit explicit retry", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-capture-failure-")), path = join(dir, "state.sqlite");
  const store = new ProjectStore(path); let service: ImplementationService | undefined;
  try {
    const { p, state, id } = seed(store); store.connectWorkspace(p.id, p.revision, dir);
    const git = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
    let calls = 0;
    service = new ImplementationService(store, { async perform() { calls++; return JSON.stringify(output(id)); } }, git);
    service.configure(p.id, p.revision, state.config!); service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const saved = store.execution(p.id), good = structuredClone(saved);
    saved.planning!.targetMaterials![id]!.records[0]!.record.text = "Tampered witness";
    store.saveExecution(p.id, saved);
    const before = store.execution(p.id), count = calls;
    assert.throws(() => service!.start(p.id, p.revision, "plan"), /materials.*identity/);
    assert.deepEqual(store.execution(p.id), before); assert.equal(store.executionActive(p.id), false); assert.equal(calls, count);
    good.version = before.version; store.saveExecution(p.id, good);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    assert.equal(store.execution(p.id).planning!.status, "proposed"); assert.equal(calls, count);
  } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

for (const change of ["unrelated", "relevant", "global", "model", "legacy", "tampered"] as const)
  test(`cross-revision planning validates exact target inputs (${change}) across reopen`, async () => {
    const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, "planning-input-reuse-")), path = join(dir, "state.sqlite");
    let store = new ProjectStore(path), service: ImplementationService | undefined;
    try {
      let { p, state, id } = seed(store, 0);
      p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "billing", title: "Billing", purpose: "Independent billing", dependencies: [] }]);
      store.connectWorkspace(p.id, p.revision, dir);
      const fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
      let calls = 0;
      const adapter = { async perform() { calls++; return JSON.stringify(output(id)); } };
      service = new ImplementationService(store, adapter, fakeGit); service.configure(p.id, p.revision, state.config!);
      service.start(p.id, p.revision, "plan"); await until(service, p.id);
      let saved = store.execution(p.id); const original = structuredClone(saved.planning!);
      assert.equal(calls, 1); assert.equal(original.status, "proposed"); assert.ok(original.targetInputs![id]!.packageKey);
      if (change === "legacy") { delete saved.planning!.targetInputs; store.saveExecution(p.id, saved); }
      if (change === "tampered") { saved.planning!.output!.packages[0]!.steps = ["Unbound replacement"]; store.saveExecution(p.id, saved); }
      const historical = structuredClone(store.execution(p.id).planning!);
      p = store.note(p.id, p.revision, "New exact human decision", change === "relevant" ? "runtime" : change === "global" ? "project" : "billing");
      await service.close(); store.close(); store = new ProjectStore(path);
      service = new ImplementationService(store, adapter, fakeGit);
      if (change === "model") service.configure(p.id, p.revision, { ...state.config!, modelID: "changed-model" });
      const before = calls;
      if (change === "tampered") {
        const unchanged = store.execution(p.id);
        assert.throws(() => service!.start(p.id, p.revision, "plan"), /receipt/);
        assert.deepEqual(store.execution(p.id), unchanged); assert.equal(store.executionActive(p.id), false); assert.equal(calls, before);
        return;
      }
      service.start(p.id, p.revision, "plan"); await until(service, p.id);
      saved = store.execution(p.id);
      assert.deepEqual(saved.planningHistory!.at(-1), historical, "Original computation and identity remain immutable");
      {
        assert.equal(saved.planning!.status, "proposed", saved.planning!.diagnostic);
        assert.equal(calls - before, change === "unrelated" ? 0 : 1);
        assert.equal(saved.planning!.revision, p.revision);
        if (change === "unrelated") {
          assert.deepEqual(saved.planning!.targetInputs![id], original.targetInputs![id]);
          assert.deepEqual(saved.planning!.output!.packages, original.output!.packages);
        }
      }
      assert.equal(saved.run, undefined); assert.deepEqual(saved.config!.dependencies, {});
    } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
  });

test("planning input identity includes optional candidate behavior, mandatory evidence, global context and assessment metadata", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store, 0), baseline = planningTargetInput(p, state, id).inputKey;
    for (const mutate of [
      (copy: typeof p) => { copy.requirements[0]!.acceptance.push("A changed acceptance scenario"); },
      (copy: typeof p) => { copy.sources[0]!.text += "Changed initial intent"; },
      (copy: typeof p) => { copy.epics[0]!.purpose += "Changed global scope"; },
      (copy: typeof p) => { copy.requirements.push({ ...copy.requirements[0]!, id: "candidate", statement: "New supporting behavior" }); },
    ]) {
      const copy = structuredClone(p); mutate(copy); assert.notEqual(planningTargetInput(copy, state, id).inputKey, baseline);
    }
    const copy = structuredClone(state); copy.assessments[id] = { status: "missing" } as ExecutionState["assessments"][string];
    assert.notEqual(planningTargetInput(p, copy, id).inputKey, baseline);
  } finally { store.close(); }
});

test("a changed target is replanned while another exact-input package is retained; approval still requires the new current plan", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-mixed-reuse-")), store = new ProjectStore(":memory:");
  let service: ImplementationService | undefined;
  try {
    let { p, state, id } = seed(store, 0);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "billing", title: "Billing", purpose: "Billing", dependencies: [] }]);
    const setup = store.beginJob(p.id, p.revision).job; store.claimJob(setup.id, Date.now() + 60000);
    store.finishJob(setup.id, { summary: "Two workflows", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: [{ epicID: "billing", statement: "Save invoices", rationale: "Human request", sourceIDs: [p.sources[0]!.id], acceptance: ["Reopen invoices"] }] });
    p = store.get(p.id); const billing = p.requirements.find((r) => r.epicID === "billing")!.id;
    p = store.review(p.id, p.revision, billing, "accepted", ""); store.connectWorkspace(p.id, p.revision, dir);
    const calls: string[] = [], fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
    service = new ImplementationService(store, { async perform(request) { calls.push(request.requirementID!); return JSON.stringify(output(request.requirementID!)); } }, fakeGit);
    service.configure(p.id, p.revision, state.config!); service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const original = structuredClone(store.execution(p.id).planning!); assert.equal(calls.length, 2);
    p = store.note(p.id, p.revision, "Runtime must preserve offline progress", "runtime");
    const stale = store.execution(p.id);
    assert.throws(() => service!.reviewPlan(p.id, p.revision, stale.version, original.id, "approve", [], ""), /stale|unavailable/i);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const current = store.execution(p.id), plan = current.planning!;
    assert.deepEqual(calls, [id, billing, id]); assert.equal(plan.status, "proposed", plan.diagnostic);
    assert.deepEqual(plan.targetInputs![billing], original.targetInputs![billing]);
    assert.equal(plan.targetInputs![id]!.originPlanID, plan.id); assert.equal(plan.targetInputs![id]!.originRevision, p.revision);
    assert.deepEqual(current.config!.dependencies, {}); assert.equal(current.run, undefined);
    service.reviewPlan(p.id, p.revision, current.version, plan.id, "approve", [], "Reviewed current inputs and retained package");
    assert.equal(store.execution(p.id).planning!.status, "approved");
  } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("partial exact planning stages continue across a revision-only edit without resetting attempts or rereading accepted batches", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-partial-inputs-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path), service: ImplementationService | undefined;
  try {
    let { p, state, id } = seed(store); store.connectWorkspace(p.id, p.revision, dir);
    const fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
    let calls = 0, fail = true; const hashes: string[] = [];
    const adapter = { async perform({ prompt }: { prompt: string }) {
      calls++; hashes.push(createHash("sha256").update(prompt).digest("hex"));
      if (fail && calls === 2) throw new Error("Interrupted second stage"); return JSON.stringify(output(id));
    } };
    service = new ImplementationService(store, adapter, fakeGit); service.configure(p.id, p.revision, state.config!);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const original = structuredClone(store.execution(p.id).planning!);
    assert.equal(original.stageWork![id]!.receipts.length, 1); assert.equal(original.stageWork![id]!.attempts, 1);
    p = store.organize(p.id, p.revision, []);
    await service.close(); store.close(); store = new ProjectStore(path); fail = false;
    service = new ImplementationService(store, adapter, fakeGit); service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const plan = store.execution(p.id).planning!;
    assert.equal(plan.status, "proposed", plan.diagnostic); assert.equal(plan.revision, p.revision);
    assert.equal(hashes.filter((hash) => hash === hashes[0]).length, 1);
    assert.equal(plan.stageWork![id]!.receipts[1]!.attempts, 2);
    assert.deepEqual(plan.stageWork![id]!.receipts[0], original.stageWork![id]!.receipts[0]);
    assert.deepEqual(store.execution(p.id).planningHistory!.at(-1), original);
  } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("exact-input planning receipts survive portable adoption and repeated compatible follow-ups", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-input-portable-")), root = join(dir, "repo"), clone = join(dir, "clone"); mkdirSync(root); mkdirSync(clone);
  const store = new ProjectStore(join(dir, "state.sqlite")), consumer = new ProjectStore(":memory:");
  let producer: ImplementationService | undefined, service: ImplementationService | undefined;
  try {
    let { p, state, id } = seed(store, 0);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "billing", title: "Billing", purpose: "Billing", dependencies: [] }]);
    store.connectWorkspace(p.id, p.revision, root);
    const fakeGit = (path: string) => () => ({ async localPreflight() {}, async git() { return path; } }) as unknown as GitDelivery;
    producer = new ImplementationService(store, { async perform() { return JSON.stringify(output(id)); } }, fakeGit(root));
    producer.configure(p.id, p.revision, state.config!); producer.start(p.id, p.revision, "plan"); await until(producer, p.id);
    const original = structuredClone(store.execution(p.id).planning!);
    p = store.note(p.id, p.revision, "Independent billing decision", "billing");
    store.syncWorkspace(p.id); cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    p = consumer.openWorkspace(clone, p.model);
    service = new ImplementationService(consumer, { async perform() { assert.fail("Compatible exact target does not need another request"); } }, fakeGit(clone));
    for (let round = 0; round < 2; round++) {
      service.start(p.id, p.revision, "plan"); await until(service, p.id);
      const plan = consumer.execution(p.id).planning!;
      assert.equal(plan.status, "proposed", plan.diagnostic); assert.deepEqual(plan.targetInputs, original.targetInputs);
      assert.deepEqual(plan.output!.packages, original.output!.packages);
      p = consumer.note(p.id, p.revision, `Further independent billing note ${round}`, "billing");
    }
  } finally { await producer?.close(); await service?.close(); consumer.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("older saved planning stays unchanged on reopen; unsupported input receipts fail closed without rewriting bytes", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-input-upgrade-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const { p, state } = seed(store, 0); store.saveExecution(p.id, state);
    const original = store.execution(p.id);
    for (let n = 0; n < 2; n++) { store.close(); store = new ProjectStore(path); assert.deepEqual(store.execution(p.id), original); }
    store.close(); store = new ProjectStore(":memory:");
    const db = new Database(path), raw = JSON.stringify({ ...original, planning: { ...original.planning,
      targetInputs: { target: { format: 99, policy: "future" } } } });
    db.prepare("UPDATE execution_state SET payload=? WHERE project_id=?").run(raw, p.id); db.close();
    assert.throws(() => new ProjectStore(path));
    const saved = new Database(path); assert.equal((saved.prepare("SELECT payload FROM execution_state WHERE project_id=?").get(p.id) as { payload: string }).payload, raw); saved.close();
    // Retry after restoring the unsupported row, with all earlier work intact.
    const repair = new Database(path); repair.prepare("UPDATE execution_state SET payload=? WHERE project_id=?").run(JSON.stringify(original), p.id); repair.close();
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.execution(p.id), original);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

function expand(input: any): any {
  const decode = (value: any, field = ""): any => {
    if (typeof value === "number" && input.identifierTable && field !== "sharedTextID" && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return input.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((v) => decode(v, field));
    if (!value || typeof value !== "object") return value;
    if (Object.keys(value).length === 1 && value.recordTable) {
      const { columns, rows, absent = [] } = value.recordTable;
      return rows.map((row: unknown[], r: number) => Object.fromEntries(columns.flatMap((key: string, c: number) => absent.some(([a, b]: number[]) => a === r && b === c) ? [] : [[key, decode(row[c], key)]])));
    }
    if (Object.keys(value).length === 1 && value.sharedTextID) return input.sharedText.values[value.sharedTextID];
    if (Object.keys(value).length === 1 && value.textParts) return value.textParts.map((v: unknown) => decode(v)).join("");
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v, k)]));
  };
  return decode(input);
}

test("planning wire retains exact strings, IDs, missing/null values; historical assessment bodies are not request evidence", () => {
  const input = { evidence: [{ id: "source-1", text: "Original 🐾 wording\r\n".repeat(80), extra: null }, { id: "source-1", text: "Original 🐾 wording\r\n".repeat(80) }] };
  const decoded = expand(JSON.parse(planningWire(input)));
  assert.deepEqual(decoded.evidence, input.evidence);
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store, 0);
    state.assessments[id] = { status: "unknown", diagnostic: "NOT_SUPPLIED_HISTORY".repeat(40000) } as unknown as ExecutionState["assessments"][string];
    const before = JSON.stringify(state);
    const context = implementationPlanningContext(p, state, id);
    assert.ok(!context.prompt.includes("NOT_SUPPLIED_HISTORY"));
    assert.equal(JSON.stringify(state), before);
    checkExecutionContext(context.prompt, false, id, 0, true);
  } finally { store.close(); }
});

test("oversized mandatory planning reads and verifies every exact record before exposing a package", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store), before = JSON.stringify(p);
    assert.throws(() => implementationPlanningContext(p, state, id), PlanningContextOverflow);
    const materials = planningStageMaterials(p, state, id), reads = new Map<string, string>(), verifies = new Set<string>();
    let calls = 0, saves = 0;
    const completed = await runImplementationStages(p, state, id, () => { saves++; }, () => {}, async (prompt) => {
      calls++; checkExecutionContext(prompt, false, id, 0, true);
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
      assert.deepEqual(data.target.requirement, p.requirements[0]);
      assert.equal(state.planning!.output, undefined);
      assert.equal(state.planning!.stageWork![id]!.attempts, 1, "Attempt is saved before dispatch");
      for (const source of data.target.evidence) {
        if (data.planningStage.phase === "collect") reads.set(source.id, source.text); else verifies.add(source.id);
      }
      return JSON.stringify(output(id));
    });
    const work = state.planning!.stageWork![id]!;
    assert.equal(calls, work.batches.length * 2); assert.ok(work.batches.length > 1); assert.ok(saves > calls);
    for (const record of materials.records.filter((r) => r.field === "evidence")) {
      assert.equal(reads.get(record.record.id), (record.record as { text: string }).text); assert.ok(verifies.has(record.record.id));
    }
    assert.deepEqual(completed.output, output(id)); assert.match(completed.reviewQuestion, /cross-batch uncertainty/);
    assert.equal(JSON.stringify(p), before); replayImplementationStages(p, materials, work);
    await runImplementationStages(p, state, id, () => {}, () => {}, async () => assert.fail("Completed checks cannot repeat"));
  } finally { store.close(); }
});

test("verification cannot add positive findings, rewrite steps, erase questions or cite unread evidence", async () => {
  for (const mode of ["steps", "questions", "citation"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const { p, state, id } = seed(store); let calls = 0;
      await assert.rejects(runImplementationStages(p, state, id, () => {}, () => {}, async (prompt) => {
        calls++; const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1))), result = output(id);
        if (mode === "citation") result.packages[0]!.prerequisites = [{ requirementID: id, kind: "hard", reason: "Unreviewed", evidenceIDs: ["invented-record"], confidence: "high" }];
        else if (data.planningStage.phase === "collect") result.packages[0]!.questions = ["Resolve an exact relationship"];
        else if (mode === "steps") result.packages[0]!.steps = ["Invent a new operation"];
        return JSON.stringify(result);
      }), /verification|distinct|evidence|questions/i);
      assert.ok(calls > 0); assert.equal(state.planning!.output, undefined);
      assert.equal(state.planning!.stageWork![id]!.attempts, 1);
    } finally { store.close(); }
  }
});

test("staged planning survives reopen and portable continuation; retry skips completed calls, preserves failed history and rejects future formats", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-stage-upgrade-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path); let service: ImplementationService | undefined;
  try {
    const { p, state, id } = seed(store); store.connectWorkspace(p.id, p.revision, dir);
    const fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
    let calls = 0, fail = true; const hashes: string[] = [];
    const adapter = { async perform(request: { prompt: string }) {
      calls++; hashes.push(createHash("sha256").update(request.prompt).digest("hex"));
      if (fail && calls === 3) throw new Error("Fixture connection failure");
      return JSON.stringify(output(id));
    } };
    service = new ImplementationService(store, adapter, fakeGit); service.configure(p.id, p.revision, state.config!);
    // Simulate a legacy context-blocked plan: no new envelope or reset is necessary.
    const old = store.execution(p.id); old.planning = { ...state.planning!, status: "failed", diagnostic: "Legacy context blocked", bindingID: store.workspace(p.id)!.bindingID!, configFingerprint: JSON.stringify({}) };
    store.saveExecution(p.id, old);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const failed = structuredClone(store.execution(p.id).planning!);
    assert.equal(failed.status, "failed"); assert.equal(failed.stageWork![id]!.receipts.length, 2); assert.equal(failed.stageWork![id]!.attempts, 1);
    const portable = portableExecution(store.execution(p.id)); assert.deepEqual(portable.planning!.stageWork, failed.stageWork); assert.equal(portable.planning!.sessions, undefined);
    const decoded = decodePortable(renderWorkspace(p, store.execution(p.id)), p.model);
    assert.deepEqual(decoded.execution.planning!.stageWork, failed.stageWork);
    replayImplementationStages(decoded.project, planningStageMaterials(decoded.project, decoded.execution, id), decoded.execution.planning!.stageWork![id]!);
    await service.close(); store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.execution(p.id).planning, failed); fail = false;
    service = new ImplementationService(store, adapter, fakeGit); service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const saved = store.execution(p.id), work = saved.planning!.stageWork![id]!;
    assert.equal(saved.planning!.status, "proposed", saved.planning!.diagnostic);
    assert.equal(hashes.filter((hash) => hash === hashes[0]).length, 1); assert.equal(hashes.filter((hash) => hash === hashes[1]).length, 1);
    assert.equal(work.receipts[2]!.attempts, 2); assert.deepEqual(work.receipts.slice(0, 2), failed.stageWork![id]!.receipts);
    assert.deepEqual(saved.planningHistory!.find((plan) => plan.id === failed.id), failed);
    assert.ok(saved.planning!.output!.packages[0]!.questions.length); assert.equal(saved.run, undefined);
    await service.close(); store.close();
    const bytes = JSON.stringify({ ...saved, planning: { ...saved.planning, stageWork: { [id]: { ...work, format: 99 } } } });
    const db = new Database(path); db.prepare("UPDATE execution_state SET payload=? WHERE project_id=?").run(bytes, p.id); db.close();
    store = new ProjectStore(":memory:"); assert.throws(() => new ProjectStore(path));
    const raw = new Database(path, { readonly: true }); assert.equal((raw.prepare("SELECT payload FROM execution_state WHERE project_id=?").get(p.id) as { payload: string }).payload, bytes); raw.close();
  } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("budget pause, cancellation, stale results and spent attempts retain exact progress without publishing", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store); let calls = 0;
    await assert.rejects(runImplementationStages(p, state, id, () => {}, () => {}, async () => { calls++; return JSON.stringify(output(id)); }, () => { if (calls === 2) throw new PlanningBudgetPause("Pause"); }), PlanningBudgetPause);
    let work = state.planning!.stageWork![id]!; assert.equal(work.receipts.length, 2); assert.equal(work.attempts, 0);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await assert.rejects(runImplementationStages(p, state, id, () => {}, () => {}, async () => { throw new Error("Cancelled or disconnected"); }), /Cancelled/);
      assert.equal(work.attempts, attempt); assert.equal(work.receipts.length, 2);
    }
    await assert.rejects(runImplementationStages(p, state, id, () => {}, () => {}, async () => assert.fail("Exhausted stages cannot dispatch")), /exhausted/);
    assert.equal(state.planning!.output, undefined);
    const other = seed(store); let currentCalls = 0;
    await assert.rejects(runImplementationStages(other.p, other.state, other.id, () => {}, () => { if (++currentCalls === 2) throw new Error("Specification changed"); }, async () => JSON.stringify(output(other.id))), /Specification changed/);
    work = other.state.planning!.stageWork![other.id]!; assert.equal(work.receipts.length, 0); assert.equal(work.attempts, 1);
    const materials = planningStageMaterials(other.p, other.state, other.id); work.inputKey = "0".repeat(64);
    assert.throws(() => replayImplementationStages(other.p, materials, work), /inputs changed/);
    assert.throws(() => implementationPlanningWorkSchema.parse({ ...work, policy: "future" }));
  } finally { store.close(); }
});

for (const phase of ["collect", "final"] as const) test(`planning saves original ${phase} receipts before reporting changed inputs`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store); let changed = false, calls = 0; let durable: ExecutionState | undefined;
    await assert.rejects(runImplementationStages(p, state, id, () => { durable = structuredClone(state); },
      () => { if (changed) throw new Error("Inputs changed"); }, async () => {
        calls++;
        const work = state.planning!.stageWork![id]!;
        if (phase === "collect" || work.receipts.length === work.batches.length * 2 - 1) changed = true;
        return JSON.stringify(output(id));
      }, () => {}, () => {}), /Inputs changed/);
    const work = durable!.planning!.stageWork![id]!;
    assert.equal(work.receipts.length, calls); assert.equal(work.attempts, 0); assert.equal(durable!.planning!.output, undefined);
    replayImplementationStages(p, planningStageMaterials(p, durable!, id), work);
    const before = calls;
    await runImplementationStages(p, durable!, id, () => {}, () => {}, async () => { calls++; return JSON.stringify(output(id)); });
    assert.equal(calls - before, work.batches.length * 2 - before);
    if (phase === "final") assert.equal(calls, before, "Completed final verification cannot repeat");
  } finally { store.close(); }
});

for (const staged of [false, true]) for (const failure of ["changed", "changed-final", "cancelled", "expired", "stolen", "malformed"] as const)
  test(`${staged ? "staged" : "single-context"} planning preserves only owned validated replies (${failure})`, async () => {
    const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, "planning-late-")), path = join(dir, "state.sqlite");
    let store = new ProjectStore(path), service: ImplementationService | undefined;
    try {
      const { p, state, id } = seed(store, staged ? 10 : 0); store.connectWorkspace(p.id, p.revision, dir);
      let calls = 0;
      const fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
      service = new ImplementationService(store, { async perform() {
        calls++;
        assert.throws(() => store.note(p.id, p.revision, "Public edits remain blocked", "project"), /implementation|execution/i);
        if (failure === "cancelled") service!.stop(p.id);
        const work = store.execution(p.id).planning!.stageWork?.[id];
        if (failure === "changed" || failure === "changed-final" && (!work || work.receipts.length === work.batches.length * 2 - 1)) {
          // Deliberate external DB mutation, not a supported public edit during planning.
          const db = new Database(path), changed = { ...p, revision: p.revision + 1 };
          db.prepare("UPDATE projects SET revision=?, payload=? WHERE id=?").run(changed.revision, JSON.stringify(changed), p.id); db.close();
        }
        if (failure === "expired" || failure === "stolen") {
          const db = new Database(path);
          if (failure === "expired") db.prepare("UPDATE execution_leases SET lease_until=? WHERE project_id=?").run(Date.now() - 1, p.id);
          else db.prepare("UPDATE execution_leases SET owner=? WHERE project_id=?").run("another-worker", p.id);
          db.close();
        }
        return failure === "malformed" ? "{}" : JSON.stringify(output(id));
      } }, fakeGit);
      service.configure(p.id, p.revision, state.config!); service.start(p.id, p.revision, "plan");
      // isActive also observes a stolen live lease; wait for this service's own operation instead.
      for (let n = 0; n < 1500 && service.operation(p.id); n++) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(service.operation(p.id), undefined);
      const saved = store.execution(p.id).planning!;
      const expectedCalls = staged && failure === "changed-final" ? saved.stageWork![id]!.batches.length * 2 : 1;
      assert.equal(calls, expectedCalls);
      assert.notEqual(saved.status, "proposed");
      assert.equal(saved.stageWork?.[id]?.receipts.length ?? saved.output?.packages.length ?? 0, failure.startsWith("changed") ? expectedCalls : 0);
      if (failure.startsWith("changed")) {
        assert.equal(saved.revision, p.revision); assert.match(saved.diagnostic!, /changed/i);
        if (staged) {
          const original = store.get(p.id, p.revision);
          replayImplementationStages(original, planningStageMaterials(original, store.execution(p.id), id), saved.stageWork![id]!);
        }
      }
      assert.equal(store.execution(p.id).run, undefined);
      await service.close(); store.close(); store = new ProjectStore(path); assert.deepEqual(store.execution(p.id).planning, saved);
    } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
  });

test("indivisible mandatory evidence remains blocked before calls rather than truncated", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, state, id } = seed(store, 0); p.sources[0]!.text = prose("indivisible", 2000);
    assert.throws(() => planImplementationStages(planningStageMaterials(p, state, id)), /Context blocked before inference/);
  } finally { store.close(); }
});

test("Prepare plan pauses at 32 staged requests and explicitly continues without repeating completed checks", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-stage-budget-")), store = new ProjectStore(":memory:");
  let service: ImplementationService | undefined;
  try {
    const { p, state, id } = seed(store, 72); store.connectWorkspace(p.id, p.revision, dir);
    let calls = 0; const contexts: string[] = [];
    const fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
    service = new ImplementationService(store, { async perform(request) { calls++; contexts.push(request.prompt); return JSON.stringify(output(id)); } }, fakeGit);
    service.configure(p.id, p.revision, state.config!); service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const paused = structuredClone(store.execution(p.id).planning!);
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 32);
    assert.equal(paused.stageWork![id]!.receipts.length, 32); assert.equal(paused.stageWork![id]!.attempts, 0);
    assert.equal(paused.output, undefined); assert.match(paused.diagnostic!, /Prepare plan explicitly/);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const finished = store.execution(p.id).planning!;
    assert.equal(finished.status, "proposed", finished.diagnostic);
    assert.equal(calls, finished.stageWork![id]!.batches.length * 2);
    assert.equal(new Set(contexts).size, calls); assert.deepEqual(finished.stageWork![id]!.receipts.slice(0, 32), paused.stageWork![id]!.receipts);
  } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

async function until(service: ImplementationService, id: string) {
  for (let i = 0; i < 1500 && service.isActive(id); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(service.isActive(id), false);
}

for (const completed of [1, "all"] as const) test(`additive planning follow-up retains ${completed} original reads, collects pending evidence and verifies every current batch`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const seeded = seed(store), original = store.get(seeded.p.id), { state, id } = seeded; let calls = 0;
    try {
      await runImplementationStages(original, state, id, () => {}, () => {}, async () => {
        if (completed === 1 && ++calls === 2) throw new Error("Original request interrupted"); return JSON.stringify(output(id));
      });
    } catch (error) { assert.match(String(error), /Original request interrupted/); }
    const source = structuredClone(state.planning!.stageWork![id]!); assert.equal(source.format, 1); if (source.format !== 1) assert.fail();
    const sourceMaterials = planningStageMaterials(original, state, id);
    const current = store.note(original.id, original.revision, "New human constraint: preserve offline progress", "runtime");
    const materials = planningStageMaterials(current, state, id);
    const followup = planImplementationFollowup(current, materials, sourceMaterials, source, "original-plan", original.revision, planningStageInputKey(sourceMaterials.inputKey))!;
    assert.equal(followup.format, 2); if (followup.format !== 2) assert.fail();
    const oldRead = new Set(source.batches.slice(0, Math.min(source.receipts.length, source.batches.length)).flat());
    assert.ok(followup.collectionBatches.flat().every((key) => !oldRead.has(key)));
    assert.deepEqual(new Set(followup.collectionBatches.flat()), new Set(materials.records.filter((record) => !oldRead.has(record.key)).map((record) => record.key)));
    const before = structuredClone(source), verified = new Set<string>(); let newCalls = 0;
    state.planning = { ...state.planning!, id: "followup", revision: current.revision, output: undefined, stageWork: { [id]: followup } };
    const result = await runImplementationStages(current, state, id, () => {}, () => {}, async (prompt) => {
      newCalls++;
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
      assert.equal(data.planningStage.retainedCollection, true); assert.equal(data.planningStage.sourceRevision, original.revision);
      if (data.planningStage.phase === "collect") for (const record of data.target.evidence) assert.ok(!oldRead.has(`evidence:${record.id}`));
      else for (const record of data.target.evidence) verified.add(record.id);
      return JSON.stringify(output(id));
    });
    assert.equal(newCalls, planningStageTotal(followup)); assert.ok(newCalls < followup.batches.length * 2);
    for (const record of materials.records.filter((record) => record.field === "evidence")) assert.ok(verified.has(record.record.id));
    assert.deepEqual(result.output, output(id)); assert.deepEqual(followup.baseline.work, before);
    await runImplementationStages(current, state, id, () => {}, () => {}, async () => assert.fail("Completed current verification cannot repeat"));
    const broken = structuredClone(followup); broken.collectionBatches = []; broken.receipts = [];
    assert.throws(() => replayImplementationStages(current, materials, broken), /every changed\/unread/);
    const tampered = structuredClone(followup); tampered.baseline.work.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayImplementationStages(current, materials, tampered), /identity mismatch/);
    for (const [index, mutate] of [
      (copy: typeof current) => { copy.sources[0]!.text += "Changed old intent"; },
      (copy: typeof current) => { copy.requirements[0]!.acceptance.push("New target behavior"); },
      (copy: typeof current) => { copy.summary += "Changed global policy"; },
    ].entries()) {
      const copy = structuredClone(current); mutate(copy);
      const reconciled = planImplementationFollowup(copy, planningStageMaterials(copy, state, id), sourceMaterials, source,
        "original-plan", original.revision, planningStageInputKey(sourceMaterials.inputKey));
      if (index === 0) assert.equal(reconciled?.format, 4, "Changed evidence is recollected, not reused as an unchanged read");
      else assert.equal(reconciled, undefined, "Changed target/global policy still requires fresh collection");
    }
  } finally { store.close(); }
});

test("Prepare plan creates an additive collection follow-up; restart and portable adoption continue it without repeating saved reads", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-collection-")), root = join(dir, "repo"), clone = join(dir, "clone"); mkdirSync(root); mkdirSync(clone);
  const path = join(dir, "state.sqlite"); let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  let service: ImplementationService | undefined, adopted: ImplementationService | undefined;
  try {
    let { p, state, id } = seed(store); store.connectWorkspace(p.id, p.revision, root);
    const fakeGit = (path: string) => () => ({ async localPreflight() {}, async git() { return path; } }) as unknown as GitDelivery;
    let mode: "original" | "followup" | "finish" = "original", calls = 0;
    const prompts: string[] = [];
    const adapter = { async perform({ prompt }: { prompt: string }) {
      calls++; prompts.push(prompt);
      if (mode === "original" && calls === 2) throw new Error("Pause original plan");
      if (mode === "followup") throw new Error("Pause follow-up after saving its new schedule");
      return JSON.stringify(output(id));
    } };
    service = new ImplementationService(store, adapter, fakeGit(root)); service.configure(p.id, p.revision, state.config!);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const original = structuredClone(store.execution(p.id).planning!);
    p = store.note(p.id, p.revision, "Offline progress is essential", "runtime"); mode = "followup";
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const partial = structuredClone(store.execution(p.id).planning!), work = partial.stageWork![id]!;
    assert.equal(work.format, 2, partial.diagnostic); assert.equal(work.attempts, 1); assert.equal(work.receipts.length, 0);
    assert.deepEqual(store.execution(p.id).planningHistory!.at(-1), original);
    await service.close(); store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.execution(p.id).planning, partial);
    store.syncWorkspace(p.id); cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, p.model); mode = "finish";
    adopted = new ImplementationService(consumer, adapter, fakeGit(clone)); adopted.start(opened.id, opened.revision, "plan"); await until(adopted, opened.id);
    const finished = consumer.execution(p.id).planning!;
    assert.equal(finished.status, "proposed", finished.diagnostic); assert.equal(finished.stageWork![id]!.format, 2);
    assert.equal(finished.stageWork![id]!.receipts[0]!.attempts, 2);
    assert.equal(prompts.filter((prompt) => prompt === prompts[0]).length, 1, "Original accepted collection request was not repeated");
    assert.equal(finished.stageWork![id]!.receipts.length, planningStageTotal(work));
    const finalWork = finished.stageWork![id]!;
    assert.deepEqual(finalWork.format === 2 && finalWork.baseline.work, original.stageWork![id]);
    assert.equal(consumer.execution(p.id).run, undefined);
    const changed = consumer.note(p.id, opened.revision, "A further offline progress constraint", "runtime");
    adopted.start(changed.id, changed.revision, "plan"); await until(adopted, changed.id);
    const chained = consumer.execution(p.id).planning!;
    assert.equal(chained.status, "proposed", chained.diagnostic);
    const chainedWork = chained.stageWork![id]!; assert.equal(chainedWork.format, 3); if (chainedWork.format !== 3) assert.fail();
    assert.deepEqual(chainedWork.baseline.work, finalWork);
    assert.ok(chainedWork.collectionBatches.flat().every((key) => !planningCollectedKeys(finalWork).has(key)));
    const portableChain = decodePortable(renderWorkspace(changed, consumer.execution(p.id)), changed.model);
    const projectedWork = portableChain.execution.planning!.stageWork![id]!;
    assert.deepEqual(projectedWork, chainedWork);
    replayImplementationStages(portableChain.project, planningStageMaterials(portableChain.project, portableChain.execution, id), projectedWork);
  } finally { await service?.close(); await adopted?.close(); store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("repeated additive planning follow-ups retain partial ancestry, collect pending-only evidence and bound saved depth", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const seeded = seed(store), { state, id } = seeded; let original = store.get(seeded.p.id);
    let requests = 0;
    await assert.rejects(runImplementationStages(original, state, id, () => {}, () => {}, async () => {
      if (++requests === 2) throw new Error("Pause original collection"); return JSON.stringify(output(id));
    }), /Pause original/);
    let source = structuredClone(state.planning!.stageWork![id]!);
    for (let round = 1; round < planningAncestryLimit; round++) {
      const sourceBefore = structuredClone(source), sourceMaterials = planningStageMaterials(original, state, id);
      const current = store.note(original.id, original.revision, `Added exact human evidence ${round}`, "runtime"), materials = planningStageMaterials(current, state, id);
      const work = planImplementationFollowup(current, materials, sourceMaterials, source, `source-plan-${round}`, original.revision,
        planningStageInputKey(sourceMaterials.inputKey))!;
      assert.equal(work.format, round === 1 ? 2 : 3);
      assert.equal(planningWorkDepth(work), round + 1); assert.deepEqual(work.baseline.work, sourceBefore);
      assert.deepEqual(new Set(work.collectionBatches.flat()), new Set(materials.records.filter((record) => !planningCollectedKeys(source).has(record.key)).map((record) => record.key)));
      state.planning = { ...state.planning!, id: `plan-${round}`, revision: current.revision, stageWork: { [id]: work }, output: undefined };
      let calls = 0;
      await assert.rejects(runImplementationStages(current, state, id, () => {}, () => {}, async () => {
        if (++calls === 2) throw new Error("Pause follow-up"); return JSON.stringify(output(id));
      }), /Pause follow-up/);
      assert.equal(work.receipts.length, 1); assert.equal(work.attempts, 1);
      assert.deepEqual(work.baseline.work, sourceBefore); assert.equal(state.planning!.output, undefined);
      source = structuredClone(work); original = current;
    }
    assert.equal(planningWorkDepth(source), planningAncestryLimit);
    const material = planningStageMaterials(original, state, id), next = store.note(original.id, original.revision, "Evidence beyond the ancestry limit", "runtime");
    const before = structuredClone(source);
    assert.equal(planImplementationFollowup(next, planningStageMaterials(next, state, id), material, source, "bounded-source", original.revision,
      planningStageInputKey(material.inputKey)), undefined, "The next changed input uses fresh work without rewriting bounded history");
    assert.deepEqual(source, before);
    const oversized = structuredClone(source); if (oversized.format === 1) assert.fail();
    oversized.baseline.work = source;
    assert.equal(implementationPlanningWorkSchema.safeParse(oversized).success, false);
    const cycle = structuredClone(source); if (cycle.format === 1) assert.fail(); cycle.baseline.work = cycle;
    assert.equal(implementationPlanningWorkSchema.safeParse(cycle).success, false, "Cyclic input is rejected before recursive schema descent");
    state.planning!.stageWork = { [id]: source };
    const verified = new Set<string>();
    await runImplementationStages(original, state, id, () => {}, () => {}, async (prompt) => {
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
      if (data.planningStage.phase === "verify") for (const evidence of data.target.evidence) verified.add(evidence.id);
      return JSON.stringify(output(id));
    });
    for (const record of material.records.filter((record) => record.field === "evidence")) assert.ok(verified.has(record.record.id));
    assert.equal(source.receipts[1]!.attempts, 2); assert.equal(source.receipts.length, planningStageTotal(source));
  } finally { store.close(); }
});

for (const scope of ["runtime", "inbox"] as const) test(`a ${scope} follow-up with no new accepted response retains older reads and spent attempts for a further changed input`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const seeded = seed(store), { state, id } = seeded, original = store.get(seeded.p.id);
    await runImplementationStages(original, state, id, () => {}, () => {}, async () => JSON.stringify(output(id)));
    const source = state.planning!.stageWork![id]!, sourceMaterial = planningStageMaterials(original, state, id);
    const first = store.note(original.id, original.revision, "First added constraint", scope), firstMaterial = planningStageMaterials(first, state, id);
    const partial = planImplementationFollowup(first, firstMaterial, sourceMaterial, source, "original", original.revision,
      planningStageInputKey(sourceMaterial.inputKey))!;
    partial.attempts = 3; assert.equal(partial.receipts.length, 0);
    if (scope === "inbox") {
      if (partial.format === 1) assert.fail();
      assert.equal(partial.collectionBatches.length, 0, "Inventory-only changes require full verification, not repeated collection");
    }
    const second = store.note(first.id, first.revision, "Second added constraint", "runtime"), secondMaterial = planningStageMaterials(second, state, id);
    const chained = planImplementationFollowup(second, secondMaterial, firstMaterial, partial, "first-followup", first.revision,
      planningStageInputKey(firstMaterial.inputKey))!;
    assert.equal(chained.format, 3); if (chained.format !== 3) assert.fail();
    assert.equal(chained.baseline.work.attempts, 3); assert.equal(chained.attempts, 0);
    assert.deepEqual(planningCollectedKeys(chained), planningCollectedKeys(source));
    assert.equal(chained.collectionBatches.flat().length, scope === "runtime" ? 2 : 1, "Every still-unread mandatory addition requires collection");
    const tampered = structuredClone(chained);
    if (tampered.baseline.work.format === 1) assert.fail();
    tampered.baseline.work.baseline.work.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayImplementationStages(second, secondMaterial, tampered), /identity mismatch/);
  } finally { store.close(); }
});

test("the planning ancestry limit explains fresh collection and preserves the bounded predecessor unchanged", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-ancestry-limit-")), store = new ProjectStore(":memory:"); let service: ImplementationService | undefined;
  try {
    const seeded = seed(store), { state, id } = seeded; let project = store.get(seeded.p.id);
    await runImplementationStages(project, state, id, () => {}, () => {}, async () => JSON.stringify(output(id)));
    let source = state.planning!.stageWork![id]!;
    for (let round = 1; round < planningAncestryLimit; round++) {
      const previous = project, material = planningStageMaterials(previous, state, id);
      project = store.note(previous.id, previous.revision, `Added constraint ${round}`, "runtime");
      source = planImplementationFollowup(project, planningStageMaterials(project, state, id), material, source, `plan-${round}`, previous.revision,
        planningStageInputKey(material.inputKey))!; source.attempts = 1;
    }
    store.connectWorkspace(project.id, project.revision, dir);
    state.planning = { ...state.planning!, id: "bounded-predecessor", revision: project.revision, status: "failed",
      bindingID: store.workspace(project.id)!.bindingID!, configFingerprint: planningConfigFingerprint(state), stageWork: { [id]: source },
      targetInputs: { [id]: { format: 1, policy: "exact-planning-inputs-v1", mode: "staged", originPlanID: "bounded-predecessor", originRevision: project.revision,
        inputKey: planningStageInputKey(planningStageMaterials(project, state, id).inputKey) } } };
    store.saveExecution(project.id, state); const original = structuredClone(store.execution(project.id).planning);
    project = store.note(project.id, project.revision, "A constraint beyond the bounded ancestry", "runtime");
    let calls = 0; const fakeGit = () => ({ async localPreflight() {}, async git() { return dir; } }) as unknown as GitDelivery;
    service = new ImplementationService(store, { async perform() { calls++; return JSON.stringify(output(id)); } }, fakeGit);
    service.start(project.id, project.revision, "plan"); await until(service, project.id);
    const saved = store.execution(project.id), plan = saved.planning!, fresh = plan.stageWork![id]!;
    assert.equal(plan.status, "proposed", plan.diagnostic); assert.equal(fresh.format, 1); assert.equal(calls, fresh.batches.length * 2);
    assert.match(plan.output!.summary, /bounded planning ancestry.*Original work remains in history/);
    assert.deepEqual(saved.planningHistory!.at(-1), original); assert.equal(saved.run, undefined);
  } finally { await service?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

async function evidencePlanningFixture(store: ProjectStore, question = false) {
  let { p, state, id } = seed(store);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
    requirements: [{ epicID: "runtime", statement: "Provide local persistence primitives", rationale: "Shared approved foundation", sourceIDs: [p.sources[0]!.id], acceptance: ["Storage primitives are available"] }] });
  p = store.get(p.id); const dependency = p.requirements.find((record) => record.id !== id)!.id;
  p = store.review(p.id, p.revision, dependency, "accepted", "");
  p = store.note(p.id, p.revision, "Original applicable retention evidence", "runtime");
  const noteID = p.sources.at(-1)!.id;
  state.config!.dependencies[id] = [dependency]; state.planning!.revision = p.revision;
  const original = store.get(p.id);
  let citation = noteID;
  if (question) {
    // Curated saved context: the target has an indirect question reference. This
    // tests evidence reconciliation, not public approval of unresolved behavior.
    citation = `question-${id}`;
    original.questions.push({ id: citation, epicID: "runtime", text: "Which storage mode is desired?", whyItMatters: "Preserve the chosen behavior",
      options: [{ label: "Offline", consequence: "Save without a network" }, { label: "Online", consequence: "Require connectivity" }], status: "pending", evidenceIDs: [original.sources[0]!.id] });
    original.requirements.find((record) => record.id === id)!.sourceIDs.push(citation);
  }
  await runImplementationStages(original, state, id, () => {}, () => {}, async (prompt) => {
    const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1))), value = output(id);
    if (data.evidenceIDs.includes(citation)) value.packages[0]!.prerequisites = [{ requirementID: dependency, kind: "hard", reason: "Historical evidence proposal",
      evidenceIDs: [citation], confidence: "medium" }];
    return JSON.stringify(value);
  });
  return { original, state, id, noteID, citation, dependency, source: structuredClone(state.planning!.stageWork![id]!), materials: planningStageMaterials(original, state, id) };
}

for (const mode of ["changed", "removed", "superseded", "question"] as const)
  test(`planning reconciles ${mode} evidence without reusing changed reads or obsolete dependency citations`, async () => {
    const store = new ProjectStore(":memory:");
    try {
      const f = await evidencePlanningFixture(store, mode === "question"), { state, id, original, source } = f;
      // Independent current snapshot. Original human content remains in its witness.
      const current = structuredClone(original); current.revision++;
      if (mode === "changed") current.sources.find((record) => record.id === f.noteID)!.text = "Corrected retention evidence";
      if (mode === "removed") current.sources = current.sources.filter((record) => record.id !== f.noteID);
      if (mode === "superseded") current.sources.push({ id: "new-retention-evidence", kind: "note", epicID: "runtime", text: "Current human retention decision", supersedes: f.noteID });
      if (mode === "question") {
        const question = current.questions.find((record) => record.id === f.citation)!;
        question.status = "answered"; question.sourceID = "current-answer";
        current.sources.push({ id: "current-answer", kind: "answer", questionID: question.id, epicID: "runtime", text: "Offline" });
      }
      const materials = planningStageMaterials(current, state, id);
      const work = planImplementationFollowup(current, materials, f.materials, source, "original-evidence-plan", original.revision,
        planningStageInputKey(f.materials.inputKey))!;
      assert.equal(work.format, 4); if (work.format !== 4) assert.fail();
      assert.ok(!work.retainedRecordKeys.includes(`${mode === "question" ? "questions" : "evidence"}:${f.citation}`) || mode === "superseded");
      if (mode === "removed") assert.deepEqual(work.collectionBatches.flat(), [`retired:evidence:${f.noteID}`]);
      if (mode === "question") assert.ok(work.delta.changed.includes(`questions:${f.citation}`));
      if (mode === "superseded") assert.ok(work.delta.historicalOnlyIDs.includes(f.noteID));
      state.planning = { ...state.planning!, id: "evidence-followup", revision: current.revision, output: undefined, stageWork: { [id]: work } };
      let calls = 0; const verified = new Set<string>(); let sawBefore = false, sawRetired = false;
      const result = await runImplementationStages(current, state, id, () => {}, () => {}, async (prompt) => {
        calls++; const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
        assert.equal(data.draft.packages[0].prerequisites.length, 0, "Affected old proposals are historical, not current dependency proof");
        assert.ok(data.draft.packages[0].questions.some((text: string) => text.includes("missing or superseded evidence does not establish independence")));
        const reconciliation = data.evidenceReconciliation;
        if (reconciliation.changedEvidence.length) {
          sawBefore = true;
          assert.equal(data.planningStage.phase, "collect", "Old bodies are not repeated in every verification request");
          assert.notDeepEqual(reconciliation.changedEvidence[0].previous, reconciliation.changedEvidence[0].current);
        }
        if (reconciliation.retiredEvidence.length) {
          sawRetired = true; assert.equal(reconciliation.retiredEvidence[0].previous.id, f.noteID);
        }
        if (mode === "removed" || mode === "superseded") assert.ok(!data.evidenceIDs.includes(f.noteID), "Retired/superseded IDs cannot authorize a current prerequisite");
        if (data.planningStage.phase === "verify") for (const record of data.target.evidence) verified.add(record.id);
        const value = structuredClone(data.draft); value.summary = "Current evidence reconciled";
        if (data.planningStage.phase === "collect") value.packages[0].steps = ["Implement the current evidence-backed behavior"];
        return JSON.stringify(value);
      });
      assert.equal(calls, planningStageTotal(work)); assert.ok(calls < work.batches.length * 2);
      assert.equal(sawBefore, mode === "changed" || mode === "question"); assert.equal(sawRetired, mode === "removed");
      for (const record of materials.records.filter((record) => record.field === "evidence")) assert.ok(verified.has(record.record.id));
      assert.deepEqual(work.baseline.work, source); assert.deepEqual(state.config!.dependencies[id], [f.dependency]);
      assert.equal(state.run, undefined); assert.ok(result.output.packages[0]!.questions.length);
      assert.ok(!planningCollectedKeys(work).has(`retired:evidence:${f.noteID}`));
      const altered = structuredClone(work); altered.retainedRecordKeys = [];
      assert.throws(() => replayImplementationStages(current, materials, altered), /exact retained records/);
      await runImplementationStages(current, state, id, () => {}, () => {}, async () => assert.fail("Completed current verification cannot repeat"));
    } finally { store.close(); }
  });

test("retired evidence cannot be smuggled back as a dependency and malformed reconciliation retains spent attempts", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = await evidencePlanningFixture(store), current = structuredClone(f.original); current.revision++;
    current.sources = current.sources.filter((record) => record.id !== f.noteID);
    const material = planningStageMaterials(current, f.state, f.id), work = planImplementationFollowup(current, material, f.materials, f.source,
      "original", f.original.revision, planningStageInputKey(f.materials.inputKey))!;
    assert.equal(work.format, 4); if (work.format !== 4) assert.fail();
    f.state.planning = { ...f.state.planning!, revision: current.revision, output: undefined, stageWork: { [f.id]: work } };
    await assert.rejects(runImplementationStages(current, f.state, f.id, () => {}, () => {}, async (prompt) => {
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1))), value = structuredClone(data.draft);
      value.packages[0].prerequisites = [{ requirementID: f.dependency, kind: "hard", reason: "An obsolete proposal", evidenceIDs: [f.noteID], confidence: "high" }];
      return JSON.stringify(value);
    }), /supplied evidence/);
    assert.equal(work.attempts, 1); assert.equal(work.receipts.length, 0); assert.equal(f.state.planning!.output, undefined);
    await assert.rejects(runImplementationStages(current, f.state, f.id, () => {}, () => {}, async () => "{}"));
    assert.equal(work.attempts, 2); assert.deepEqual(work.baseline.work, f.source);
    const broken = structuredClone(work); broken.collectionBatches = [];
    assert.throws(() => replayImplementationStages(current, material, broken), /every changed\/unread/);
  } finally { store.close(); }
});

for (const mode of ["removed", "superseded"] as const) test(`owned ${mode}-evidence reconciliation survives restart, portable adoption and another follow-up`, async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-evidence-recovery-")), root = join(dir, "repo"), clone = join(dir, "clone"), path = join(dir, "state.sqlite");
  mkdirSync(root); mkdirSync(clone); let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  let service: ImplementationService | undefined, adopted: ImplementationService | undefined;
  try {
    const f = await evidencePlanningFixture(store); let project = f.original;
    store.connectWorkspace(project.id, project.revision, root);
    const fakeGit = (path: string) => () => ({ async localPreflight() {}, async git() { return path; } }) as unknown as GitDelivery;
    let pause = false, reconcileCalls = 0;
    const adapter = { async perform({ prompt, requirementID }: { prompt: string; requirementID?: string }) {
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
      if (data.evidenceReconciliation) {
        reconcileCalls++; if (pause && requirementID === f.dependency) { pause = false; throw new Error("Pause current evidence reconciliation"); }
        return JSON.stringify(data.draft);
      }
      const value = output(requirementID!);
      if (requirementID === f.id && data.evidenceIDs.includes(f.noteID)) value.packages[0]!.prerequisites = [{ requirementID: f.dependency, kind: "hard", reason: "Historical proposal",
        evidenceIDs: [f.noteID], confidence: "medium" }];
      return JSON.stringify(value);
    } };
    service = new ImplementationService(store, adapter, fakeGit(root)); service.configure(project.id, project.revision, f.state.config!);
    service.start(project.id, project.revision, "plan"); await until(service, project.id);
    const original = structuredClone(store.execution(project.id).planning!); assert.equal(original.status, "proposed", original.diagnostic);
    project = store.note(project.id, project.revision, "Explicitly revised retained evidence", "runtime");
    // Curated external-current-snapshot transition, not a new source-editing API.
    // Older revisions and human source bodies remain untouched in saved history.
    if (mode === "removed") project.sources = project.sources.filter((record) => record.id !== f.noteID);
    else project.sources.at(-1)!.supersedes = f.noteID;
    const db = new Database(path);
    db.prepare("UPDATE projects SET payload=? WHERE id=?").run(JSON.stringify(project), project.id);
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(JSON.stringify(project), project.id, project.revision); db.close();
    pause = true; service.start(project.id, project.revision, "plan"); await until(service, project.id);
    const partial = structuredClone(store.execution(project.id).planning!), work = partial.stageWork![f.dependency]!;
    assert.equal(work.format, 4, partial.diagnostic); assert.equal(work.attempts, 1); assert.equal(work.receipts.length, 0);
    if (work.format !== 4) assert.fail();
    assert.equal(work.baseline.sourceCreatedAt, original.createdAt); assert.equal(work.baseline.sourceFinishedAt, original.finishedAt);
    assert.deepEqual(partial.output!.packages.map((item) => item.requirementID), [f.id]); assert.deepEqual(store.execution(project.id).planningHistory!.at(-1), original);
    await service.close(); store.close(); store = new ProjectStore(path); assert.deepEqual(store.execution(project.id).planning, partial);
    store.syncWorkspace(project.id); cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, project.model);
    adopted = new ImplementationService(consumer, adapter, fakeGit(clone)); adopted.start(opened.id, opened.revision, "plan"); await until(adopted, opened.id);
    const finished = consumer.execution(opened.id).planning!, finishedWork = finished.stageWork![f.id]!;
    assert.equal(finished.status, "proposed", finished.diagnostic); assert.equal(finishedWork.format, 4);
    assert.equal(finished.stageWork![f.dependency]!.receipts[0]!.attempts, 2); assert.ok(finished.output!.packages.find((item) => item.requirementID === f.id)!.questions.length);
    assert.deepEqual(consumer.execution(opened.id).config!.dependencies, f.state.config!.dependencies); assert.equal(consumer.execution(opened.id).run, undefined);
    const changed = consumer.note(opened.id, opened.revision, "Another current applicable constraint", "runtime"), before = reconcileCalls;
    adopted.start(changed.id, changed.revision, "plan"); await until(adopted, changed.id);
    const repeated = consumer.execution(changed.id).planning!, repeatedWork = repeated.stageWork![f.id]!;
    assert.equal(repeated.status, "proposed", repeated.diagnostic); assert.equal(repeatedWork.format, 4, "Current-authority filtering cannot be downgraded by later additive evidence");
    if (repeatedWork.format !== 4) assert.fail();
    assert.deepEqual(repeatedWork.baseline.work, finishedWork);
    assert.equal(reconcileCalls - before, Object.values(repeated.stageWork!).reduce((sum, item) => sum + planningStageTotal(item), 0));
    const portable = decodePortable(renderWorkspace(changed, consumer.execution(changed.id)), changed.model);
    const projected = portable.execution.planning!.stageWork![f.id]!; assert.deepEqual(projected, repeatedWork);
    replayImplementationStages(portable.project, planningStageMaterials(portable.project, portable.execution, f.id), projected);
    const invalid = structuredClone(consumer.execution(changed.id)); invalid.planning!.stageWork![f.id] = { ...repeatedWork, policy: "future-evidence-policy" } as any;
    const saved = consumer.execution(changed.id); assert.throws(() => consumer.saveExecution(changed.id, invalid)); assert.deepEqual(consumer.execution(changed.id), saved);
  } finally { await service?.close(); await adopted?.close(); store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

for (const failure of ["cancelled", "lost-warning", "rewrite-verification"] as const) test(`evidence reconciliation rejects ${failure} replies without losing original work`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = await evidencePlanningFixture(store), current = structuredClone(f.original); current.revision++;
    current.sources.find((record) => record.id === f.noteID)!.text = "Revised current evidence";
    const work = planImplementationFollowup(current, planningStageMaterials(current, f.state, f.id), f.materials, f.source,
      "original", f.original.revision, planningStageInputKey(f.materials.inputKey))!;
    assert.equal(work.format, 4); if (work.format !== 4) assert.fail();
    f.state.planning = { ...f.state.planning!, revision: current.revision, output: undefined, stageWork: { [f.id]: work } };
    const controller = new AbortController(), check = () => controller.signal.throwIfAborted();
    await assert.rejects(runImplementationStages(current, f.state, f.id, () => {}, check, async (prompt) => {
      const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1))), value = structuredClone(data.draft);
      if (failure === "cancelled") controller.abort();
      if (failure === "lost-warning") value.packages[0].questions = [];
      if (failure === "rewrite-verification" && data.planningStage.phase === "verify") value.packages[0].steps = ["Unverified replacement behavior"];
      return JSON.stringify(value);
    }, () => {}, check));
    assert.equal(work.attempts, 1); assert.equal(work.receipts.length, failure === "rewrite-verification" ? work.collectionBatches.length : 0);
    assert.deepEqual(work.baseline.work, f.source); assert.equal(f.state.planning!.output, undefined); assert.equal(f.state.run, undefined);
  } finally { store.close(); }
});

test("evidence reconciliation refuses requirement/target/global changes and tampered source identities before requesting work", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = await evidencePlanningFixture(store), current = structuredClone(f.original); current.revision++;
    current.sources.find((record) => record.id === f.noteID)!.text = "A corrected observation";
    for (const mutate of [
      (project: typeof current) => { project.requirements.find((record) => record.id === f.dependency)!.acceptance.push("A different foundation contract"); },
      (project: typeof current) => { project.requirements.find((record) => record.id === f.id)!.acceptance.push("A different target contract"); },
      (project: typeof current) => { project.summary += "Different global policy"; },
    ]) {
      const copy = structuredClone(current); mutate(copy);
      assert.equal(planImplementationFollowup(copy, planningStageMaterials(copy, f.state, f.id), f.materials, f.source,
        "original", f.original.revision, planningStageInputKey(f.materials.inputKey)), undefined);
    }
    const broken = structuredClone(f.source); broken.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => planImplementationFollowup(current, planningStageMaterials(current, f.state, f.id), f.materials, broken,
      "original", f.original.revision, planningStageInputKey(f.materials.inputKey)), /identity mismatch/);
    assert.deepEqual(f.state.planning!.stageWork![f.id], f.source);
  } finally { store.close(); }
});

test("an oversized retained draft blocks evidence reconciliation before inference without truncating original work", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const seeded = seed(store), { state, id } = seeded, original = store.get(seeded.p.id); let calls = 0;
    await assert.rejects(runImplementationStages(original, state, id, () => {}, () => {}, async () => {
      calls++; const value = output(id);
      value.packages[0]!.steps = Array.from({ length: 12 }, (_, index) => `${index}`.padEnd(2000, "x"));
      value.packages[0]!.verification = Array.from({ length: 12 }, (_, index) => `${index}`.padEnd(2000, "y"));
      return JSON.stringify(value);
    }), /Context blocked before inference/);
    assert.equal(calls, 1);
    const source = structuredClone(state.planning!.stageWork![id]!), before = structuredClone(source);
    assert.equal(source.receipts.length, 1);
    const material = planningStageMaterials(original, state, id), current = structuredClone(original); current.revision++;
    current.sources.find((record) => record.kind === "note")!.text = "Corrected current fact";
    assert.throws(() => planImplementationFollowup(current, planningStageMaterials(current, state, id), material, source,
      "original", original.revision, planningStageInputKey(material.inputKey)), /retained draft/);
    assert.deepEqual(source, before); assert.equal(calls, 1);
  } finally { store.close(); }
});

for (const failure of ["cancelled", "malformed", "rewrite-verification", "lost-question"] as const)
  test(`planning collection follow-up rejects ${failure} work and preserves original receipts and charged attempts`, async () => {
    const store = new ProjectStore(":memory:");
    try {
      const { p: seeded, state, id } = seed(store), original = store.get(seeded.id);
      await runImplementationStages(original, state, id, () => {}, () => {}, async () => {
        const value = output(id); if (failure === "lost-question") value.packages[0]!.questions = ["Which persistence tradeoff is intended?"];
        return JSON.stringify(value);
      });
      const source = structuredClone(state.planning!.stageWork![id]!); if (source.format !== 1) assert.fail();
      const oldMaterial = planningStageMaterials(original, state, id), current = store.note(original.id, original.revision, "New applicable human constraint", "runtime");
      const materials = planningStageMaterials(current, state, id), followup = planImplementationFollowup(current, materials, oldMaterial, source,
        "original-plan", original.revision, planningStageInputKey(oldMaterial.inputKey))!;
      assert.equal(followup.format, 2); if (followup.format !== 2) assert.fail();
      state.planning = { ...state.planning!, revision: current.revision, output: undefined, stageWork: { [id]: followup } };
      const controller = new AbortController();
      const accept = () => controller.signal.throwIfAborted();
      const adapter = async (prompt: string) => {
        if (failure === "cancelled") controller.abort();
        if (failure === "malformed") return "{}";
        const data = expand(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1))), value = output(id);
        if (data.planningStage.phase === "verify") value.packages[0]!.steps = ["Unverified rewritten scope"];
        return JSON.stringify(value);
      };
      await assert.rejects(runImplementationStages(current, state, id, () => {}, accept, adapter, () => {}, accept));
      assert.equal(followup.attempts, 1); assert.equal(state.planning!.output, undefined);
      assert.deepEqual(followup.baseline.work, source);
      if (failure !== "rewrite-verification") assert.equal(followup.receipts.length, 0);
      else assert.equal(followup.receipts.length, followup.collectionBatches.length, "Old verification cannot bypass current validation");
      if (failure === "malformed") {
        for (let attempt = 2; attempt <= 3; attempt++) {
          await assert.rejects(runImplementationStages(current, state, id, () => {}, () => {}, adapter)); assert.equal(followup.attempts, attempt);
        }
        await assert.rejects(runImplementationStages(current, state, id, () => {}, () => {}, async () => assert.fail("No allowance reset")), /exhausted/);
      }
    } finally { store.close(); }
  });

test("mixed evidence-reconciliation ancestry survives startup and refuses a future nested witness without replacing saved data", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "planning-baseline-upgrade-")), path = join(dir, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const { p, state, id } = seed(store), original = store.get(p.id);
    await runImplementationStages(original, state, id, () => {}, () => {}, async () => JSON.stringify(output(id)));
    const source = state.planning!.stageWork![id]!; if (source.format !== 1) assert.fail();
    const oldMaterial = planningStageMaterials(original, state, id), current = store.note(p.id, p.revision, "New applicable note", "runtime");
    const work = planImplementationFollowup(current, planningStageMaterials(current, state, id), oldMaterial, source,
      "original-plan", original.revision, planningStageInputKey(oldMaterial.inputKey))!;
    const currentMaterial = planningStageMaterials(current, state, id), second = store.note(current.id, current.revision, "Further applicable note", "runtime");
    const chain = planImplementationFollowup(second, planningStageMaterials(second, state, id), currentMaterial, work,
      "first-followup", current.revision, planningStageInputKey(currentMaterial.inputKey))!;
    assert.equal(chain.format, 3);
    const secondMaterial = planningStageMaterials(second, state, id), third = store.note(second.id, second.revision, "Explicit revised-evidence fixture", "runtime");
    third.sources.find((record) => record.kind === "note" && record.epicID === "project")!.text = "Corrected current evidence";
    const fixtureDB = new Database(path);
    fixtureDB.prepare("UPDATE projects SET payload=? WHERE id=?").run(JSON.stringify(third), third.id);
    fixtureDB.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(JSON.stringify(third), third.id, third.revision); fixtureDB.close();
    const reconciliation = planImplementationFollowup(third, planningStageMaterials(third, state, id), secondMaterial, chain,
      "second-followup", second.revision, planningStageInputKey(secondMaterial.inputKey))!;
    assert.equal(reconciliation.format, 4);
    state.planning = { ...state.planning!, revision: third.revision, stageWork: { [id]: reconciliation } }; store.saveExecution(p.id, state);
    const saved = store.execution(p.id);
    for (let n = 0; n < 2; n++) { store.close(); store = new ProjectStore(path); assert.deepEqual(store.execution(p.id), saved); }
    store.close(); store = new ProjectStore(":memory:");
    const unsupported = structuredClone(saved) as any; unsupported.planning.stageWork[id].baseline.work.policy = "future-policy";
    const raw = JSON.stringify(unsupported), db = new Database(path);
    db.prepare("UPDATE execution_state SET payload=? WHERE project_id=?").run(raw, p.id); db.close();
    assert.throws(() => new ProjectStore(path));
    const check = new Database(path); assert.equal((check.prepare("SELECT payload FROM execution_state WHERE project_id=?").get(p.id) as { payload: string }).payload, raw);
    check.prepare("UPDATE execution_state SET payload=? WHERE project_id=?").run(JSON.stringify(saved), p.id); check.close();
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.execution(p.id), saved);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
