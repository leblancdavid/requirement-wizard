import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { emptyExecution, executionConfigSchema, type ExecutionState } from "../core/execution.js";
import { checkExecutionContext } from "../core/execution-context.js";
import { implementationPlanningWorkSchema, type ImplementationPlanningOutput } from "../core/implementation-planning.js";
import { implementationPlanningContext, PlanningContextOverflow, planningWire } from "./planning-context.js";
import { planImplementationStages, planningStageMaterials, replayImplementationStages, runImplementationStages, PlanningBudgetPause } from "./planning-stages.js";
import { ImplementationService } from "./implementation.js";
import type { GitDelivery } from "./git-delivery.js";
import { portableExecution, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";

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
