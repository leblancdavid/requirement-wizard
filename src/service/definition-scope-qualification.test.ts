import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inspectScopeQualification, preflightScopeQualification, runScopeQualification, scopeQualificationCases } from "./definition-scope-qualification.js";
import type { DiscoveryAdapter } from "./discovery.js";
import { ProjectStore } from "../storage/store.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

async function fixture() {
  const root = resolve(".reqwizit-state/tests"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "scope-qualification-"));
  return { directory, input: { caseID: "retention-choice", providerID: "openai", modelID: "fixture", runDirectory: join(directory, "attempt"), confirmAIUsage: true },
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}
function adapter(hook: () => void = () => {}): DiscoveryAdapter {
  return { async analyze(project, options) {
    hook(); assert.equal(options.research, false);
    const data = options.context.data as { scope: { scopeKey: string; dimensions: string[] }; evidence: unknown };
    assert.ok(JSON.stringify(data.evidence).includes("No option has been chosen"));
    options.onTelemetry({ actualModel: project.model, usage: null, runtimeReportedCost: null });
    const marker = options.context.manifest.definitionScopeReview!;
    const evidenceIDs = [options.context.manifest.includedIDs.at(-1)!];
    return { scopeKey: marker.scopeKey, contextKey: marker.contextKey,
      checks: data.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "An unanswered retention choice affects recovery.", evidenceIDs })),
      crossDimensionConcerns: [{ dimensions: ["rules", "data"], explanation: "Retention determines available historical recovery.", evidenceIDs }] };
  } };
}

test("qualification preflight preserves authored cases and rejects structural contradictions without inference", () => {
  const report = preflightScopeQualification();
  assert.equal(report.calls, 0); assert.equal(report.semanticQuality, "unqualified");
  assert.equal(report.cases.length, Object.keys(scopeQualificationCases).length);
  assert.ok(report.cases.every((c) => c.completeQuotedEvidence && c.conflictingSyntheticReplyRejected));
});

test("qualification requires exact consent/selection and a fresh directory before provider construction", async () => {
  const f = await fixture(); let constructions = 0;
  const factory = () => { constructions++; return adapter(); };
  try {
    for (const bad of [{ ...f.input, confirmAIUsage: false }, { ...f.input, providerID: undefined }, { ...f.input, modelID: undefined },
      { ...f.input, connectionID: "silent-direct-route" }, { ...f.input, durationMs: 120001 }, { ...f.input, caseID: "unknown" }])
      await assert.rejects(runScopeQualification(bad, factory));
    await mkdir(f.input.runDirectory);
    await assert.rejects(runScopeQualification(f.input, factory), /EEXIST/);
    assert.equal(constructions, 0);
  } finally { await f.cleanup(); }
});

test("one-shot qualification saves exact local evidence; repeated command and readonly inspect spend no requests", async () => {
  const f = await fixture(); let calls = 0, constructions = 0;
  try {
    const factory = () => { constructions++; return adapter(() => calls++); };
    const report = await runScopeQualification(f.input, factory);
    assert.equal(report.view.status, "recorded"); if (report.view.status !== "recorded") assert.fail();
    assert.equal(report.view.jobStatus, "completed"); assert.equal(report.canPublish, false); assert.equal(report.canAuthorizeSkips, false);
    assert.equal(report.semanticQuality, "human-review-required"); assert.equal(report.liveToolEnforcement, "unqualified");
    assert.equal(report.structuralObservations?.uncertaintyRetained, true);
    assert.equal(report.structuralObservations?.crossDimensionalConcernPresent, true);
    await assert.rejects(runScopeQualification(f.input, factory), /EEXIST/);
    assert.deepEqual(await inspectScopeQualification(f.input.runDirectory), report);
    assert.equal(calls, 1); assert.equal(constructions, 1);
    const store = new ProjectStore(join(f.input.runDirectory, "state.sqlite"));
    try {
      const p = store.get(report.view.projectID);
      assert.equal(p.assessments.length, 0); assert.equal(p.requirements.length, 0);
      assert.equal(store.queuePaused(p.id), true); assert.equal(store.jobs(p.id).length, 1);
      assert.deepEqual(await inspectScopeQualification(f.input.runDirectory), report);
    } finally { store.close(); }
    const older = new Database(join(f.input.runDirectory, "state.sqlite"));
    try {
      older.pragma("user_version = 20");
      assert.deepEqual(await inspectScopeQualification(f.input.runDirectory), report);
      assert.equal(older.pragma("user_version", { simple: true }), 20, "Readonly compatibility must not migrate older qualification evidence");
    } finally { older.close(); }
  } finally { await f.cleanup(); }
});

test("qualification timeout and late output cannot overwrite saved evidence or replay spent requests", async () => {
  const f = await fixture(); let release!: () => void, calls = 0;
  try {
    const report = await runScopeQualification({ ...f.input, durationMs: 1000 }, () => ({ async analyze(p, options) {
      calls++; await new Promise<void>((done) => { release = done; });
      return adapter().analyze(p, options);
    } }));
    assert.equal(report.view.status, "recorded"); if (report.view.status !== "recorded") assert.fail();
    assert.equal(report.view.jobStatus, "interrupted"); assert.equal(report.structuralObservations, null);
    release(); await new Promise((done) => setImmediate(done));
    assert.deepEqual(await inspectScopeQualification(f.input.runDirectory), report);
    await assert.rejects(runScopeQualification(f.input, () => { assert.fail("No automatic or repeated dispatch"); }));
    assert.equal(calls, 1);
  } finally { await f.cleanup(); }
});

test("failed provider/research/model checks retain an explicit failed attempt, not qualification success", async () => {
  for (const kind of ["error", "research", "model"] as const) {
    const f = await fixture();
    try {
      const report = await runScopeQualification(f.input, () => ({ async analyze(p, options) {
        if (kind === "error") throw new Error("Synthetic sensitive transport detail");
        if (kind === "research") options.onResearch([{}] as never);
        else options.onTelemetry({ actualModel: { providerID: "other", modelID: "fallback" }, usage: null, runtimeReportedCost: null });
        return adapter().analyze(p, options);
      } }));
      assert.equal(report.view.status, "recorded"); if (report.view.status !== "recorded") assert.fail();
      assert.equal(report.view.jobStatus, "failed"); assert.equal(report.structuralObservations, null);
      assert.equal(JSON.stringify(report).includes("sensitive transport"), false);
    } finally { await f.cleanup(); }
  }
});

test("qualification inspection rejects unsupported/oversized manifests and future databases without writing them", async () => {
  const f = await fixture();
  try {
    await runScopeQualification(f.input, () => adapter());
    const manifestPath = join(f.input.runDirectory, "qualification.json"), original = await readFile(manifestPath, "utf8");
    for (const damaged of [JSON.stringify({ ...JSON.parse(original), format: 99 }), " ".repeat(8193)]) {
      await writeFile(manifestPath, damaged);
      await assert.rejects(inspectScopeQualification(f.input.runDirectory));
      assert.equal(await readFile(manifestPath, "utf8"), damaged);
    }
    await writeFile(manifestPath, original);
    const db = new Database(join(f.input.runDirectory, "state.sqlite"));
    try {
      db.pragma("user_version = 999");
      await assert.rejects(inspectScopeQualification(f.input.runDirectory), /Unsupported/);
      assert.equal(db.pragma("user_version", { simple: true }), 999);
    } finally { db.close(); }
  } finally { await f.cleanup(); }
});

test("qualification binds case/model/original witnesses and never treats structural observations as semantic proof", async () => {
  const f = await fixture();
  try {
    await runScopeQualification(f.input, () => adapter());
    const path = join(f.input.runDirectory, "qualification.json"), raw = await readFile(path, "utf8"), manifest = JSON.parse(raw);
    for (const changed of [{ ...manifest, caseID: "privacy-override" }, { ...manifest, model: { ...manifest.model, modelID: "different" } }]) {
      await writeFile(path, JSON.stringify(changed));
      await assert.rejects(inspectScopeQualification(f.input.runDirectory), /witness/);
    }
    await writeFile(path, raw);
    const db = new Database(join(f.input.runDirectory, "state.sqlite"));
    try {
      const row = db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(manifest.request.projectID, manifest.request.revision) as { payload: string };
      db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(" ".repeat(65537), manifest.request.projectID, manifest.request.revision);
      await assert.rejects(inspectScopeQualification(f.input.runDirectory), /unavailable or exceeds/);
      db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(row.payload, manifest.request.projectID, manifest.request.revision);
    } finally { db.close(); }
    const report = await inspectScopeQualification(f.input.runDirectory);
    assert.equal(report.structuralObservations?.validatedOutputSaved, true);
    assert.equal(report.semanticQuality, "human-review-required");
    assert.ok(report.limitations.some((item) => item.includes("explanation is correct")));
  } finally { await f.cleanup(); }
});

test("qualification CLI defaults offline, documents opt-in and rejects ambiguous or incomplete live arguments", async () => {
  const run = (args: string[]) => promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/qualify-definition-scope.ts", ...args], { timeout: 15000 });
  const offline = await run([]); assert.equal(JSON.parse(offline.stdout).calls, 0);
  assert.match((await run(["--help"])).stdout, /one reserved adapter invocation/);
  for (const args of [["--live"], ["--provider", "sensitive-input"], ["--inspect", "--live", "--run-dir", "unused"], ["--unknown"]]) {
    await assert.rejects(run(args), (error: unknown) => {
      const result = error as { stderr: string; stdout: string };
      assert.match(result.stderr, /No automatic retry/); assert.equal(result.stderr.includes("sensitive-input"), false); assert.equal(result.stdout, ""); return true;
    });
  }
});

test("a setup interruption leaves an inspectable reservation and never recreates or replays the attempt", async () => {
  const f = await fixture(); let constructions = 0;
  try {
    await assert.rejects(runScopeQualification(f.input, () => { constructions++; throw new Error("Interrupted before dispatch"); }), /Interrupted/);
    const before = await inspectScopeQualification(f.input.runDirectory);
    assert.equal(before.view.status, "unavailable"); assert.equal(before.structuralObservations, null);
    await assert.rejects(runScopeQualification(f.input, () => { constructions++; return adapter(); }), /EEXIST/);
    assert.deepEqual(await inspectScopeQualification(f.input.runDirectory), before); assert.equal(constructions, 1);
  } finally { await f.cleanup(); }
});

test("structurally valid but semantically wrong explanations never earn a semantic pass", async () => {
  const f = await fixture();
  try {
    const report = await runScopeQualification(f.input, () => ({ async analyze(project, options) {
      const response = await adapter().analyze(project, options) as { checks: { explanation: string }[] };
      for (const check of response.checks) check.explanation = "The user approved forever retention and backups have already been verified.";
      return response;
    } }));
    assert.equal(report.structuralObservations?.validatedOutputSaved, true);
    assert.equal(report.semanticQuality, "human-review-required"); assert.equal(report.canPublish, false);
    assert.ok(report.humanRubric.some((rule) => rule.includes("Do not choose")));
  } finally { await f.cleanup(); }
});
