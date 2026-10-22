import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { projectSchema, type Project } from "../core/model.js";
import { assessmentContextFingerprint, requirementTaskContext } from "../core/execution-context.js";
import { captureWorkspace } from "./scan.js";
import { assessmentContext, assessmentCaptureFingerprint, assessmentFootprint, assessmentImpactReason, assertAssessmentCaptureCurrent } from "./assessment.js";
import { executionConfigSchema } from "../core/execution.js";
import { command, GitDelivery } from "../service/git-delivery.js";

const requirement: Project["requirements"][number] = { id: "r1", epicID: "project", status: "accepted", statement: "Save records", rationale: "Required behavior", acceptance: ["Saved records survive restart"], sourceIDs: ["human:1"] };

test("Git assessment hints find exact feature IDs and baseline changes without treating history as evidence", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/assessment-history-"));
  const signal = new AbortController().signal;
  const git = async (...args: string[]) => {
    const result = await command(root, "git", args, signal);
    assert.equal(result.code, 0, result.output); return result.output;
  };
  const config = executionConfigSchema.parse({ repository: "owner/repo", providerID: "openai", modelID: "fixture", strategy: "main", checks: ["node --version"], dependencies: {} });
  try {
    await git("init"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.test");
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n");
    await writeFile(join(root, "shared.ts"), "export const shared = 1;\n");
    await git("add", "."); await git("commit", "-m", "feat(r1): implement", "-m", "Requirement: r1");
    const baseline = await git("rev-parse", "HEAD");
    await writeFile(join(root, "other.ts"), "export const other = true;\n");
    await git("add", "."); await git("commit", "-m", "feat(r10): unrelated", "-m", "Requirement: r10");
    await writeFile(join(root, "feature.ts"), "export const value = 2;\n");
    await git("add", "."); await git("commit", "-m", "change shared behavior without a feature ID");
    await git("revert", "--no-edit", "HEAD");
    await writeFile(join(root, "shared.ts"), "export const shared = 2;\n");
    await git("add", "shared.ts"); await git("commit", "-m", "unmarked shared module update");
    await writeFile(join(root, "other.ts"), "export const other = false;\n");
    await git("add", "other.ts");
    await writeFile(join(root, "new.ts"), "export const newlyAdded = true;\n");
    const target = new GitDelivery(root, config, signal);
    const hints = await target.assessmentHints("r1", baseline);
    assert.deepEqual([...hints.linkedPaths].sort(), ["feature.ts", "shared.ts"]);
    assert.ok(hints.changedPaths.has("shared.ts"), "Unmarked committed changes participate");
    assert.ok(hints.changedPaths.has("other.ts"), "Unmarked staged/shared changes participate");
    assert.ok(hints.changedPaths.has("new.ts"), "Untracked current code participates");
    assert.ok(!hints.changedPaths.has("feature.ts"), "A fully reverted change has no net baseline difference");
    const scan = await captureWorkspace(root, undefined, signal);
    const before = assessmentCaptureFingerprint(scan);
    const prepared = assessmentContext(requirement, scan, { gitHints: hints });
    const text = JSON.parse(prepared.text);
    assert.equal(prepared.sourceIDs.get(text.evidence[0].id), scan.snapshot.files.find((file) => file.path === "shared.ts")!.sourceID);
    assert.ok(!prepared.text.includes("feat(r1)"), "Commit claims are not model evidence");
    assert.equal(assessmentCaptureFingerprint(scan), before);
    assert.ok((await target.assessmentHints("r10", baseline)).linkedPaths.has("other.ts"));
    const missing = await new GitDelivery(root, config, signal).assessmentHints("r1", "a".repeat(40));
    assert.ok(missing.linkedPaths.has("feature.ts"), "Missing old commit only disables advisory change hints");
    const fallback = await new GitDelivery(root, config, signal).assessmentHints("r1", "--all");
    assert.ok(fallback.changedPaths.has("new.ts"), "Invalid saved revisions safely use HEAD");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(new GitDelivery(root, config, controller.signal).assessmentHints("r1"));
    class UnavailableGit extends GitDelivery {
      override async git(_args: string[]): Promise<string> { throw new Error("Unavailable history"); }
    }
    const unavailable = await new UnavailableGit(root, config, signal).assessmentHints("r1", baseline);
    assert.equal(unavailable.linkedPaths.size, 0); assert.equal(unavailable.changedPaths.size, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("history hints rank current evidence without narrowing reviewed scope or hiding requested files", () => {
  const sources = Array.from({ length: 10 }, (_, index) => ({ id: `code:${index}`, kind: "workspace" as const, epicID: "project", text: `Save records component ${index}` }));
  const scan = { workspaceKey: "fixture", sources, snapshot: { id: "scan", capturedAt: "2026-10-21T00:00:00Z",
    files: sources.map((source, index) => ({ sourceID: source.id, path: `src/component-${index}.ts`, hash: "hash", lines: 1 })), omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  const gitHints = { linkedPaths: new Set(["src/component-9.ts", "deleted.ts"]), changedPaths: new Set(["src/component-8.ts"]) };
  const prepared = assessmentContext(requirement, scan, { gitHints });
  assert.equal([...prepared.sourceIDs.values()][0], "code:9");
  assert.equal([...prepared.sourceIDs.values()][1], "code:8");
  assert.ok(prepared.availableEvidenceIDs.has("file:8"), "Unlinked code remains discoverable");
  assert.ok(assessmentContext(requirement, scan, { gitHints, requestEvidenceIDs: ["file:1"] }).sourceIDs.has("file:1"));
  const scoped = assessmentContext(requirement, scan, { gitHints, impactPaths: new Set(["src/component-0.ts"]) });
  assert.deepEqual([...scoped.sourceIDs.values()], ["code:0"], "Git does not override reviewed boundaries");
});

test("large omission inventories cannot displace exact source evidence from assessment context", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/assessment-context-"));
  try {
    await writeFile(join(root, "README.md"), "Exact captured implementation evidence.\n");
    const capture = await captureWorkspace(root, undefined, new AbortController().signal);
    const original = capture.sources[0]!;
    capture.sources = Array.from({ length: 40 }, (_, index) => ({ ...original, id: `captured-${index}`, text: `Captured component ${index}\n${"e".repeat(4900)}` }));
    capture.snapshot.files = capture.sources.map((source, index) => ({ path: `component-${index}.ts`, sourceID: source.id, hash: "hash", lines: 2 }));
    capture.snapshot.omitted = Array.from({ length: 1700 }, (_, index) => ({ path: `art/assets/omitted-${index}-${"x".repeat(80)}.png`, reason: "Unsupported/non-text file" }));
    const old = JSON.stringify({ requirement, evidence: capture.sources, omissions: capture.snapshot.omitted });
    assert.ok(old.length > 240000);
    const prepared = assessmentContext(requirement, capture);
    assert.ok(prepared.context.characters <= 48000);
    const context = JSON.parse(prepared.text);
    assert.ok(context.evidence.length < capture.sources.length, "Each request receives a focused evidence window");
    for (const source of context.evidence) assert.equal(source.text, capture.sources.find((s) => s.id === prepared.sourceIDs.get(source.id))!.text, "Selected source evidence remains byte-exact");
    assert.equal(context.omissions.count, 1700); assert.equal(context.omissions.examples.length, 8);
    assert.equal(context.omissions.reasons["Unsupported/non-text file"], 1700);
    assert.equal(prepared.sourceIDs.get("file:1"), capture.sources[0]!.id);
    assert.equal(capture.snapshot.omitted.length, 1700, "Full omission inventory is retained outside model context");
    assert.throws(() => assessmentContext({ ...requirement, statement: "human decision ".repeat(20000) }, capture), /Context blocked before inference/);
    const requestedID = context.evidenceIndex[0].id;
    const next = assessmentContext(requirement, capture, { requestEvidenceIDs: [requestedID] });
    assert.ok(next.sourceIDs.has(requestedID)); assert.ok(next.context.characters <= 48000);
    assert.throws(() => assessmentContext(requirement, capture, { requestEvidenceIDs: ["file:99999"] }), /outside the captured/);
    const tooLarge = structuredClone(capture); tooLarge.sources[0]!.text = "large indivisible evidence".repeat(4000);
    const linked = assessmentContext({ ...requirement, sourceIDs: [tooLarge.sources[0]!.id] }, tooLarge);
    assert.ok(!linked.sourceIDs.has("file:1"), "Oversized linked code is indexed rather than forced into every window");
    assert.ok(linked.availableEvidenceIDs.has("file:1"));
    const unavailable = assessmentContext(requirement, tooLarge, { requestEvidenceIDs: ["file:1"] });
    assert.equal(unavailable.sourceIDs.size, 0);
    assert.deepEqual(unavailable.deferredEvidenceIDs, ["file:1"]);
    assert.ok(unavailable.context.characters <= 48000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("answered-question proposals and linked file inventories do not crowd out assessment evidence", () => {
  const p = projectSchema.parse({ id: "p", name: "Assessment fixture", revision: 1,
    model: { providerID: "openai", modelID: "fixture" }, summary: "", goals: [], actors: [], assumptions: [],
    requirements: [{ ...requirement, sourceIDs: ["human:1", "code:1", "code:2"] }],
    sources: [{ id: "human:1", kind: "answer", epicID: "project", questionID: "q1", text: "Save locally" }],
    questions: [{ id: "q1", epicID: "project", text: "Where should records be saved?", whyItMatters: "Generated explanation", status: "answered", sourceID: "human:1",
      options: [{ label: "Save locally", consequence: "Keep records on this device" }, { label: "Remote", consequence: "Unused alternative ".repeat(500) }] }],
  });
  const sources: Project["sources"] = [1, 2].map((index) => ({ id: `code:${index}`, kind: "workspace", epicID: "project", text: `Save records implementation ${index}\n${"e".repeat(22000)}` }));
  p.sources.push(...sources);
  const scan = { workspaceKey: "fixture", sources, snapshot: { id: "scan", capturedAt: "2026-10-19T00:00:00Z", files: sources.map((s, i) => ({ sourceID: s.id, path: `src/save-${i}.ts`, hash: "hash", lines: 2 })),
    omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  const prepared = assessmentContext(p.requirements[0]!, scan, { project: p });
  assert.ok(prepared.context.characters <= 48000);
  assert.equal(prepared.sourceIDs.size, 1, "Linked file evidence is paged to fit the request");
  const context = JSON.parse(prepared.text);
  assert.equal(context.decisions[0].text, "Save locally");
  assert.deepEqual(context.questions[0].options, [{ label: "Save locally", consequence: "Keep records on this device" }]);
  assert.equal(context.evidence[0].text, sources[0]!.text);
  assert.ok(prepared.availableEvidenceIDs.has("file:2"));
  const next = assessmentContext(p.requirements[0]!, scan, { project: p, requestEvidenceIDs: ["file:2"] });
  assert.deepEqual([...next.sourceIDs.keys()], ["file:2"]);
  assert.equal(JSON.parse(next.text).evidence[0].text, sources[1]!.text);
  const batched = assessmentContext(p.requirements[0]!, scan, { project: p, requestEvidenceIDs: ["file:1", "file:2"] });
  assert.ok(batched.context.characters <= 48000);
  assert.equal(batched.sourceIDs.size, 1);
  assert.deepEqual(batched.deferredEvidenceIDs, ["file:2"]);
  assert.deepEqual(JSON.parse(batched.text).contextScope.deferredEvidenceIDs, ["file:2"]);
  assert.ok(batched.availableEvidenceIDs.has("file:2"));
  p.sources[0]!.text = "Exact human decision ".repeat(3000);
  assert.throws(() => assessmentContext(p.requirements[0]!, scan, { project: p }), /Context blocked before inference/);
});

test("assessment snapshots fingerprint exact captured scope and reject changed source bytes", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/assessment-snapshot-"));
  try {
    const signal = new AbortController().signal;
    await writeFile(join(root, "README.md"), "Original source\n");
    const first = await captureWorkspace(root, undefined, signal), second = await captureWorkspace(root, undefined, signal);
    assert.equal(assessmentCaptureFingerprint(first), assessmentCaptureFingerprint(second));
    await assertAssessmentCaptureCurrent(root, first, signal);
    await writeFile(join(root, "README.md"), "Changed source!\n");
    await assert.rejects(assertAssessmentCaptureCurrent(root, first, signal), /Files changed/);
    const changed = await captureWorkspace(root, undefined, signal);
    assert.notEqual(assessmentCaptureFingerprint(first), assessmentCaptureFingerprint(changed));
    await writeFile(join(root, "new.ts"), "export const newlyImplemented = true;\n");
    await assert.rejects(assertAssessmentCaptureCurrent(root, changed, signal, true), /Source inventory or capture coverage changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("oversized repeated approval snapshots share exact text losslessly before assessment blocks", () => {
  const p = projectSchema.parse({ id: "p", name: "Shared text fixture", revision: 1,
    model: { providerID: "openai", modelID: "fixture" }, summary: "", goals: [], actors: [], assumptions: [], questions: [],
    requirements: [requirement], sources: [{ id: "human:1", kind: "initial", text: "Save my records" }],
  });
  for (let index = 0; index < 2; index++) {
    const statement = `Constraint ${index}: ${"Exact approved behavior. ".repeat(330)}`;
    const acceptance = [`Scenario ${index}: ${"Exact acceptance behavior. ".repeat(150)}`];
    p.requirements.push({ id: `guardrail-${index}`, epicID: "project", status: "accepted", statement, acceptance, rationale: "Background", sourceIDs: [`confirmation-${index}`] });
    p.sources.push({ id: `confirmation-${index}`, kind: "confirmation", epicID: "project", requirementID: `guardrail-${index}`,
      text: `Requirement: ${statement}\nAcceptance: ${JSON.stringify(acceptance)}\nHuman decision: accepted` });
  }
  const before = structuredClone(p);
  const scan = { workspaceKey: "fixture", sources: [{ id: "current-code", kind: "workspace" as const, epicID: "project", text: "Save records implementation" }],
    snapshot: { id: "scan", capturedAt: "2026-10-19T00:00:00Z", files: [{ sourceID: "current-code", path: "src/save.ts", hash: "hash", lines: 1 }], omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  assert.ok(JSON.stringify(requirementTaskContext(p, "r1", [], false).data).length > 48000);
  const prepared = assessmentContext(p.requirements[0]!, scan, { project: p });
  const wire = JSON.parse(prepared.text);
  assert.ok(wire.sharedText);
  const expand = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (Object.keys(object).length === 1 && typeof object.sharedTextID === "string") return wire.sharedText.values[object.sharedTextID];
      if (Object.keys(object).length === 1 && Array.isArray(object.textParts)) return object.textParts.map(expand).join("");
      return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, expand(item)]));
    }
    return value;
  };
  const expanded = expand(wire) as typeof wire;
  assert.deepEqual(expanded.requirement, p.requirements[0]);
  assert.deepEqual(expanded.decisions, p.sources);
  assert.equal(expanded.evidence[0].text, scan.sources[0]!.text);
  assert.ok(prepared.context.characters <= 48000);
  assert.deepEqual(p, before);
});

test("reviewed footprints include new/deleted files, prerequisites, shared configuration and inspected evidence, with conservative omission fallback", () => {
  const p = projectSchema.parse({ id: "p", name: "Impact fixture", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    summary: "", goals: [], actors: [], assumptions: [], questions: [],
    requirements: [requirement, { ...requirement, id: "r2" }], sources: [{ id: "human:1", kind: "initial", text: "Save records" }] });
  const config = executionConfigSchema.parse({ repository: "fixture/repo", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"],
    assessmentScopes: { r1: ["src/save"], r2: ["src/other"] }, sharedAssessmentPaths: ["src/shared"] });
  const scan = { workspaceKey: "fixture", sources: [], snapshot: { id: "capture", capturedAt: "now", files: ["src/save/a.ts", "src/other/b.ts", "src/shared/c.ts", "src/config/settings.json", "package.json"]
    .map((path) => ({ path, hash: "before", sourceID: path, lines: 1 })), omitted: [] as { path: string; reason: string }[], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  const footprint = () => assessmentFootprint(p, "r1", config, scan);
  const baseline = footprint(); assert.equal(baseline.broad, false);
  scan.snapshot.files[1]!.hash = "unrelated";
  assert.equal(footprint().fingerprint, baseline.fingerprint);
  const extra = { path: "src/save/new.ts", hash: "new", sourceID: "new", lines: 1 };
  scan.snapshot.files.push(extra);
  assert.notEqual(footprint().fingerprint, baseline.fingerprint, "New implementation can resolve a previously missing result");
  assert.match(assessmentImpactReason(baseline, footprint()), /src\/save\/new.ts/);
  scan.snapshot.files.pop();
  scan.snapshot.files[2]!.hash = "shared change";
  assert.notEqual(footprint().fingerprint, baseline.fingerprint);
  scan.snapshot.files[2]!.hash = "before"; scan.snapshot.files[3]!.hash = "configuration change";
  assert.notEqual(footprint().fingerprint, baseline.fingerprint, "Nested configuration is always global");
  scan.snapshot.files[3]!.hash = "before";
  config.dependencies.r1 = ["r2"];
  const withDependency = footprint();
  scan.snapshot.files[1]!.hash = "dependency change";
  assert.notEqual(footprint().fingerprint, withDependency.fingerprint);
  delete config.assessmentScopes!.r2;
  assert.equal(footprint().broad, true, "An unscoped prerequisite widens impact to the repository");
  config.dependencies.r1 = [];
  const inspected = assessmentFootprint(p, "r1", config, scan, ["src/other/b.ts"]);
  scan.snapshot.files[1]!.hash = "inspected change";
  assert.notEqual(assessmentFootprint(p, "r1", config, scan, ["src/other/b.ts"]).fingerprint, inspected.fingerprint);
  scan.snapshot.omitted.push({ path: "src/save/omitted.ts", reason: "160-excerpt budget" });
  assert.equal(footprint().broad, true);
  scan.snapshot.omitted = []; scan.snapshot.traversalLimited = true;
  assert.equal(footprint().broad, true);
  scan.snapshot.traversalLimited = false;
  const beforeDelete = footprint(); scan.snapshot.files.shift();
  assert.notEqual(footprint().fingerprint, beforeDelete.fingerprint);
  assert.match(assessmentImpactReason(beforeDelete, footprint()), /src\/save\/a.ts/);
});

test("assessment record tables recover a near-limit context without changing decisions, IDs, fingerprints or file bytes", () => {
  const p = projectSchema.parse({ id: "p", name: "Record table fixture", revision: 1,
    summary: "", goals: [], actors: [], assumptions: [], questions: [],
    model: { providerID: "openai", modelID: "fixture" }, requirements: [requirement],
    sources: [{ id: "human:1", kind: "initial", text: "Save my records" }] });
  const scan = { workspaceKey: "fixture", sources: [{ id: "code", kind: "workspace" as const, epicID: "project", text: "Save records implementation\nByte-exact file evidence." }],
    snapshot: { id: "scan", capturedAt: "now", files: [{ sourceID: "code", path: "src/save.ts", hash: "hash", lines: 2 }], omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  let prepared: ReturnType<typeof assessmentContext> | undefined;
  for (let index = 0; index < 200; index++) {
    const id = `guardrail-${index}`, sourceID = `confirmation-${index}`;
    const statement = `Constraint ${index}: retain approved record behavior for capability ${index}.`;
    p.requirements.push({ ...requirement, id, statement, sourceIDs: [sourceID], acceptance: [`Scenario ${index}: capability ${index} is retained after restart.`] });
    p.sources.push({ id: sourceID, kind: "confirmation", epicID: "project", requirementID: id,
      text: `Human approved constraint ${index}; preserve its exact behavior and scenario.`, ...(index % 2 ? { supersedes: "human:1" } : {}) });
    const original = structuredClone(p), identity = assessmentContextFingerprint(p, "r1");
    const candidate = assessmentContext(p.requirements[0]!, scan, { project: p });
    assert.deepEqual(p, original); assert.equal(assessmentContextFingerprint(p, "r1"), identity);
    if (JSON.parse(candidate.text).recordTables) { prepared = candidate; break; }
  }
  assert.ok(prepared, "The third lossless pass must rescue a context that text/ID sharing alone cannot fit");
  assert.ok(prepared.context.characters <= 48000);
  const before = structuredClone(p), fingerprint = assessmentContextFingerprint(p, "r1"), wire = JSON.parse(prepared.text);
  const tables = (value: any): any => {
    if (Array.isArray(value)) return value.map(tables);
    if (!value || typeof value !== "object") return value;
    if (Object.keys(value).length === 1 && value.recordTable) {
      const { columns, rows, absent = [] } = value.recordTable;
      return rows.map((row: unknown[], i: number) => Object.fromEntries(columns.flatMap((key: string, j: number) =>
        absent.some(([r, c]: number[]) => r === i && c === j) ? [] : [[key, tables(row[j])]])));
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, tables(item)]));
  };
  const expand = (value: any, field = ""): any => {
    if (typeof value === "number" && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies") && field !== "sharedTextID") return wire.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((item) => expand(item, field));
    if (!value || typeof value !== "object") return value;
    if (Object.keys(value).length === 1 && value.sharedTextID) return wire.sharedText.values[value.sharedTextID];
    if (Object.keys(value).length === 1 && value.textParts) return value.textParts.map((part: unknown) => expand(part)).join("");
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, key)]));
  };
  const expanded = expand(tables(wire)), { evidence, ...records } = requirementTaskContext(p, "r1", [], false).data;
  for (const [key, value] of Object.entries({ ...records, decisions: evidence })) assert.deepEqual(expanded[key], JSON.parse(JSON.stringify(value)), key);
  assert.equal(expanded.evidence[0].text, scan.sources[0]!.text);
  assert.equal(assessmentContextFingerprint(p, "r1"), fingerprint); assert.deepEqual(p, before);
});

test("assessment boundaries reject unsafe/ambiguous paths and keep excluded code out of scoped model windows", () => {
  const base = { repository: "fixture/repo", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] };
  for (const path of ["../src", "/src", "C:\\src", "src/**", "src//nested", "src/../other", "src\u0000x"])
    assert.equal(executionConfigSchema.safeParse({ ...base, assessmentScopes: { r1: [path] } }).success, false, path);
  assert.deepEqual(executionConfigSchema.parse({ ...base, assessmentScopes: { r1: ["src\\save\\"] } }).assessmentScopes!.r1, ["src/save"]);
  const scan = { workspaceKey: "fixture", sources: ["save", "other"].map((id) => ({ id, epicID: "project", kind: "workspace" as const, text: `Save records in ${id}` })),
    snapshot: { id: "scan", capturedAt: "now", files: ["src/save/a.ts", "src/other/b.ts"].map((path, i) => ({ path, sourceID: i === 0 ? "save" : "other", hash: "hash", lines: 1 })), omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] } };
  const prepared = assessmentContext(requirement, scan, { impactPaths: new Set(["src/save/a.ts"]) });
  assert.deepEqual([...prepared.sourceIDs.values()], ["save"]);
  assert.equal(prepared.availableEvidenceIDs.size, 0);
  assert.equal(JSON.parse(prepared.text).assessmentBoundary.excludedCapturedExcerpts, 1);
});
